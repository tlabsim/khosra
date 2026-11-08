<?php
declare(strict_types=1);
require __DIR__.'/run.php';
$data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWioAAAAASUVORK5CYII=';
$cover=['id'=>uuid(),'bookId'=>$bid,'name'=>'cover.png','mime'=>'image/png','size'=>strlen(base64_decode($data)),'data'=>$data];
$withCover=$s;$withCover['files'][]=$cover;$withCover['books'][0]['coverFileId']=$cover['id'];
validate($withCover);preserveHistory($s,$withCover);
check($withCover['revisions']===$s['revisions'],'Cover metadata does not rewrite manuscript history');
$delta=['schemaVersion'=>1,'collections'=>['books'=>['upserts'=>[['id'=>$bid,'set'=>['title'=>'Renamed manuscript','coverFileId'=>$cover['id']],'unset'=>[]]],'remove'=>[]],'files'=>['upserts'=>[['id'=>$cover['id'],'set'=>array_diff_key($cover,['id'=>true]),'unset'=>[]]],'remove'=>[]]]];
$patched=syncApply($s,$delta);validate($patched);preserveHistory($s,$patched);
check($patched['books'][0]['coverFileId']===$cover['id']&&$patched['books'][0]['title']==='Renamed manuscript','Differential save accepts the cover reference with its file');
$remove=['schemaVersion'=>1,'collections'=>['books'=>['upserts'=>[['id'=>$bid,'set'=>['coverFileId'=>null],'unset'=>[]]],'remove'=>[]]]];
$removed=syncApply($patched,$remove);validate($removed);preserveHistory($patched,$removed);
check($removed['books'][0]['coverFileId']===null&&count($removed['files'])===1,'Removing a cover preserves immutable attachment history');
$bad=$withCover;$bad['files']=[];rejects(fn()=>validate($bad),422,'Missing cover attachment rejected');
$bad=$withCover;$bad['files'][0]['bookId']=uuid();rejects(fn()=>validate($bad),422,'Foreign cover attachment rejected');
$bad=$withCover;$bad['files'][0]['mime']='application/pdf';$bad['files'][0]['data']=base64_encode('%PDF-1');$bad['files'][0]['size']=6;rejects(fn()=>validate($bad),422,'PDF cannot be used as a cover');
echo "Manuscript detail and cover checks passed.\n";
