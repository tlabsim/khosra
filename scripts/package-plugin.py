"""Build a separate, credential-free Khosra plugin ZIP; never install or publish it."""
import argparse
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SVG = "http://www.w3.org/2000/svg"
ASSETS = ("assets/logomark-light.svg", "assets/logomark-dark.svg")
# Deliberate allowlist: never recursively copy workspace, credentials or backend files.
FILES = ("plugin.json", "mcp.json", "README.md", *ASSETS)


def deployment_origin(value):
    parsed = urlsplit(value)
    try:
        valid_port = parsed.port is None or 0 < parsed.port <= 65535
    except ValueError:
        valid_port = False
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or not valid_port
            or re.search(r"[\s\\]", value)):
        raise ValueError("Use an HTTPS origin without credentials, a path, query or fragment.")
    return "https://" + parsed.netloc


def build_icons(source, destination):
    original = ET.fromstring(source.read_bytes())
    box = [float(x) for x in original.attrib["viewBox"].split()]
    if len(box) != 4 or not math.isclose(box[2], box[3], abs_tol=0.001):
        raise ValueError("The source logomark must have a square viewBox.")
    size = round(box[2])
    if size < 48:
        raise ValueError("The source logomark must be at least 48 by 48.")
    ET.register_namespace("", SVG)
    for theme, paper in (("light", "#f8f7f0"), ("dark", "#e6ede0")):
        icon = ET.Element(f"{{{SVG}}}svg", {
            "width": str(size), "height": str(size),
            "viewBox": f"{box[0]:g} {box[1]:g} {size} {size}",
        })
        ET.SubElement(icon, f"{{{SVG}}}title").text = "Khosra"
        ET.SubElement(icon, f"{{{SVG}}}rect", {
            "width": str(size), "height": str(size), "fill": paper,
        })
        for child in original:
            if child.tag in (f"{{{SVG}}}g", f"{{{SVG}}}path", f"{{{SVG}}}defs"):
                copied = deepcopy(child)
                for node in copied.iter():
                    for attribute in list(node.attrib):
                        if attribute.startswith("{"):
                            del node.attrib[attribute]
                icon.append(copied)
        data = ET.tostring(icon, encoding="utf-8", xml_declaration=True)
        destination.mkdir(parents=True, exist_ok=True)
        (destination / f"logomark-{theme}.svg").write_bytes(data + b"\n")


def validate_package(files):
    if set(files) != set(FILES):
        raise ValueError("Plugin contents do not match the public-file allowlist.")
    manifest = json.loads(files["plugin.json"])
    mcp = json.loads(files["mcp.json"])
    interface = manifest["extensions"]["com.openai"]["interface"]
    for field in ("logo", "logoDark", "composerIcon", "composerIconDark"):
        reference = interface[field]
        path = PurePosixPath(reference)
        if (not reference.startswith("./assets/") or ".." in path.parts
                or "\\" in reference or str(path) not in ASSETS):
            raise ValueError("Invalid or missing plugin icon: " + reference)
        root = ET.fromstring(files[str(path)])
        width, height = float(root.attrib["width"]), float(root.attrib["height"])
        view_box = [float(x) for x in root.attrib["viewBox"].split()]
        if (root.tag != f"{{{SVG}}}svg" or width != height or width < 48
                or view_box != [0, 0, width, height]
                or len(files[str(path)]) > 5 * 1024 * 1024):
            raise ValueError("Plugin icons must be square SVGs of at least 48 by 48.")
        for node in root.iter():
            if node.tag not in {f"{{{SVG}}}{tag}" for tag in ("svg", "title", "rect", "g", "path", "defs")}:
                raise ValueError("Unexpected executable or external SVG content.")
            if any(k.lower().startswith("on") or "href" in k.lower() for k in node.attrib):
                raise ValueError("External SVG references and event handlers are not allowed.")
    if set(mcp["mcpServers"]) != {"khosra"}:
        raise ValueError("Package must contain exactly the Khosra MCP connection.")
    server = mcp["mcpServers"]["khosra"]
    origin = deployment_origin(manifest["homepage"])
    if (server["url"] != origin + "/api/mcp" or interface["websiteURL"] != origin
            or server["type"] != "streamable-http"
            or set(server) != {"url", "type"}):
        raise ValueError("Plugin must use matching deployment URLs and a credential-free remote connection.")
    for value in (manifest, mcp):
        if re.search(r'"(?:password|owner_password|clientSecret|access_token|refresh_token|headers|env|hooks|apps)"\s*:', json.dumps(value), re.I):
            raise ValueError("Private credentials, hooks or account-specific mappings must not be bundled.")


def build(origin=None, output=None):
    source = ROOT / "plugin"
    build_icons(ROOT / "public/favicon.svg", source / "assets")
    files = {name: (source / name).read_bytes() for name in FILES}
    manifest, mcp = json.loads(files["plugin.json"]), json.loads(files["mcp.json"])
    version = json.loads((ROOT / "package.json").read_text())["version"]
    manifest["version"] = version
    selected = deployment_origin(origin or manifest["homepage"])
    manifest["homepage"] = selected
    manifest["extensions"]["com.openai"]["interface"]["websiteURL"] = selected
    mcp["mcpServers"]["khosra"]["url"] = selected + "/api/mcp"
    for name, value in (("plugin.json", manifest), ("mcp.json", mcp)):
        files[name] = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    validate_package(files)
    archive = output or ROOT / "releases" / f"khosra-{version}-chatgpt-plugin.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        for name, data in files.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            zipped.writestr(entry, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    Path(str(archive) + ".sha256").write_text(digest + "  " + archive.name + "\n")
    print(f"{archive}\nSHA-256: {digest}\nPlugin only; no installation, website upload or publication performed.")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", help="HTTPS deployment origin; defaults to the source manifest.")
    args = parser.parse_args()
    try:
        build(args.origin)
    except (ValueError, OSError, KeyError, ET.ParseError) as error:
        parser.exit(1, f"Cannot package plugin: {error}\n")
