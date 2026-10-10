'use strict';
const path=require('node:path'),fs=require('node:fs');
function isInstalledExecutable(executable,exists=fs.existsSync){const directory=path.dirname(executable);return ['Uninstall SsenDoc.exe','Uninstall 쎈doc.exe'].some(name=>exists(path.join(directory,name)));}
module.exports={isInstalledExecutable};
