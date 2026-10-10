'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{isInstalledExecutable}=require('../src/install-mode.cjs');
test('NSIS executableName uninstaller identifies an installed app',()=>{const executable=path.resolve('fixture/SsenDoc.exe');assert.equal(isInstalledExecutable(executable,file=>file===path.join(path.dirname(executable),'Uninstall SsenDoc.exe')),true);});
test('ZIP without an uninstaller never enables automatic installation',()=>assert.equal(isInstalledExecutable(path.resolve('fixture/SsenDoc.exe'),()=>false),false));
test('localized older uninstaller remains recognized',()=>assert.equal(isInstalledExecutable(path.resolve('fixture/SsenDoc.exe'),file=>path.basename(file)==='Uninstall 쎈doc.exe'),true));
