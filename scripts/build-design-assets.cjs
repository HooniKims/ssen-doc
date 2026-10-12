'use strict';
// Offline design assets. Logo glyph outlines are generated from the licensed source font.
const fs=require('node:fs/promises'),path=require('node:path'),opentype=require('opentype.js'),sharp=require('sharp');
async function bitmap(svg,width,height,file){
 const {data}=await sharp(Buffer.from(svg)).resize(width,height).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const stride=(width*3+3)&~3,bytes=Buffer.alloc(54+stride*height);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(width,18);bytes.writeInt32LE(height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(24,28);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=(y*width+x)*3,b=54+(height-1-y)*stride+x*3;bytes[b]=data[a+2];bytes[b+1]=data[a+1];bytes[b+2]=data[a];}await fs.writeFile(file,bytes);
}
async function main(){
 const font=opentype.parse(await fs.readFile('assets/Ghanachocolate.ttf')),glyph=font.getPath('쎈Doc',0,0,800),b=glyph.getBoundingBox(),pad=20;
 const commands=glyph.commands.map(c=>[c.type,...({M:['x','y'],L:['x','y'],Q:['x1','y1','x','y'],C:['x1','y1','x2','y2','x','y'],Z:[]}[c.type]||[]).map(k=>Number(c[k].toFixed(1)))].join(' ')).join(' ');
 const shape=`<path fill="#006241" d="${commands}"/>`,view=`${b.x1-pad} ${b.y1-pad} ${b.x2-b.x1+pad*2} ${b.y2-b.y1+pad*2}`;
 await fs.writeFile('assets/logo.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-label="쎈Doc">${shape}</svg>`);
 const drawing=`<rect x="40" y="40" width="944" height="944" rx="210" fill="#1E3932"/><path d="M295 195h303l142 142v492H295a45 45 0 0 1-45-45V240a45 45 0 0 1 45-45Z" fill="#F2F0EB"/><path d="M598 195v142h142" fill="none" stroke="#1E3932" stroke-width="32" stroke-linejoin="round"/><path d="M352 416h246M352 518h168M352 620h108" stroke="#1E3932" stroke-width="38" stroke-linecap="round"/><path d="m525 673 80 80 160-186" stroke="#00754A" stroke-width="65" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
 const sparkle=`<path d="M814 116c9 48 24 63 72 72-48 9-63 24-72 72-9-48-24-63-72-72 48-9 63-24 72-72Z" fill="#F2F0EB"/>`;
 const svg=size=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${drawing}${size>32?sparkle:''}</svg>`;
 await fs.writeFile('assets/icon.svg',svg(1024));for(const size of [256,512])await sharp(Buffer.from(svg(size))).resize(size).png().toFile(`assets/icon-${size}.png`);
 const sizes=[16,24,32,48,64,128,256],pngs=await Promise.all(sizes.map(size=>sharp(Buffer.from(svg(size))).resize(size).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 for(let i=0;i<sizes.length;i++){const n=6+i*16;header[n]=header[n+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,n+4);header.writeUInt16LE(32,n+6);header.writeUInt32LE(pngs[i].length,n+8);header.writeUInt32LE(offset,n+12);offset+=pngs[i].length;}await fs.writeFile('assets/icon.ico',Buffer.concat([header,...pngs]));
 await bitmap(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><rect width="164" height="314" fill="#F2F0EB"/><svg x="25" y="35" width="114" height="44" viewBox="${view}">${shape}</svg><svg x="27" y="120" width="110" height="110" viewBox="0 0 1024 1024">${drawing}</svg></svg>`,164,314,'build/installer/sidebar.bmp');
 await bitmap(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57"><rect width="150" height="57" fill="#FFFFFF"/><svg x="20" y="10" width="110" height="37" viewBox="${view}">${shape}</svg></svg>`,150,57,'build/installer/header.bmp');
 console.log('Design logo, 7-size ICO, PNGs and installer artwork generated.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
