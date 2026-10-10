'use strict';
function validateSettings(value){
  const s=typeof value==='string'?{mode:'quality',preset:value}:value;
  if(!s||!['quality','target'].includes(s.mode))throw Error('저장 설정을 확인해 주세요.');
  if(s.convertOpaquePng!==undefined&&typeof s.convertOpaquePng!=='boolean')throw Error('이미지 변환 설정을 확인해 주세요.');
  if(s.mode==='target'){
    if(typeof s.targetRatio!=='number'||!Number.isFinite(s.targetRatio)||s.targetRatio<=0||s.targetRatio>=1)throw Error('목표 용량은 원본보다 작고 0보다 커야 합니다.');
    return {mode:'target',targetRatio:s.targetRatio,convertOpaquePng:s.convertOpaquePng??true};
  }
  if(!['high','balanced','small'].includes(s.preset))throw Error('품질 설정을 확인해 주세요.');
  return {mode:'quality',preset:s.preset,convertOpaquePng:s.convertOpaquePng??false};
}
module.exports={validateSettings};
