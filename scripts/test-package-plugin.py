"""Offline checks for plugin handoff paths, deployment targeting and reproducibility."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

module = runpy.run_path(str(Path(__file__).with_name("package-plugin.py")))
ROOT, SVG = module["ROOT"], module["SVG"]


class PluginPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.archive = module["build"](output=Path(cls.directory.name) / "plugin.zip")
        with zipfile.ZipFile(cls.archive) as zipped:
            cls.files = {name: zipped.read(name) for name in zipped.namelist()}

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_public_contents_and_checksum(self):
        self.assertEqual(set(self.files), set(module["FILES"]))
        expected = Path(str(self.archive) + ".sha256").read_text().split()[0]
        self.assertEqual(expected, hashlib.sha256(self.archive.read_bytes()).hexdigest())
        module["validate_package"](self.files)
        with zipfile.ZipFile(self.archive) as zipped:
            self.assertTrue(all((entry.external_attr >> 16) & 0o777 == 0o644 for entry in zipped.infolist()))

    def test_same_sources_build_identical_archives(self):
        another = module["build"](output=Path(self.directory.name) / "again.zip")
        self.assertEqual(self.archive.read_bytes(), another.read_bytes())

    def test_other_host_changes_public_urls_without_mutating_source(self):
        before = (ROOT / "plugin/mcp.json").read_bytes()
        another = module["build"]("https://writer.example.org:8443/", Path(self.directory.name) / "host.zip")
        with zipfile.ZipFile(another) as zipped:
            mcp = json.loads(zipped.read("mcp.json"))
            manifest = json.loads(zipped.read("plugin.json"))
        self.assertEqual(mcp["mcpServers"]["khosra"]["url"], "https://writer.example.org:8443/api/mcp")
        self.assertEqual(manifest["homepage"], "https://writer.example.org:8443")
        self.assertEqual(before, (ROOT / "plugin/mcp.json").read_bytes())

    def test_invalid_origins_rejected(self):
        for value in ["http://example.org", "https://user:secret@example.org", "https://example.org/path",
                      "https://example.org?token=secret", "https://example.org#secret", "https://",
                      "https://example.org:invalid", "https://exam ple.org", "https://example.org\\evil"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                module["deployment_origin"](value)

    def test_unknown_files_and_external_icons_rejected(self):
        with self.assertRaises(ValueError):
            module["validate_package"]({**self.files, "khosra.config.php": b"secret"})
        for reference in ["../private/logo.svg", "./assets/../../secret.svg", "https://example.org/icon.svg"]:
            files = deepcopy(self.files)
            manifest = json.loads(files["plugin.json"])
            manifest["extensions"]["com.openai"]["interface"]["logo"] = reference
            files["plugin.json"] = json.dumps(manifest).encode()
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                module["validate_package"](files)

    def test_credentials_and_other_connections_rejected(self):
        files = deepcopy(self.files)
        mcp = json.loads(files["mcp.json"])
        mcp["mcpServers"]["khosra"]["headers"] = {"Authorization": "Bearer secret"}
        files["mcp.json"] = json.dumps(mcp).encode()
        with self.assertRaises(ValueError):
            module["validate_package"](files)

    def test_original_geometry_and_colors_preserved(self):
        source = ET.parse(ROOT / "public/favicon.svg").getroot()
        original = [(p.attrib["d"], p.attrib["style"]) for p in source.iter(f"{{{SVG}}}path")]
        for name in module["ASSETS"]:
            icon = ET.fromstring(self.files[name])
            paths = [(p.attrib["d"], p.attrib["style"]) for p in icon.iter(f"{{{SVG}}}path")]
            self.assertEqual(paths, original)
            self.assertEqual(icon.attrib["width"], icon.attrib["height"])


if __name__ == "__main__":
    unittest.main()
