'use strict';
require('./auth-launch.cjs');
const path=require('node:path'),root=require('electron').app.getAppPath();
globalThis.__aiTestClasses={...require(path.join(root,'src/ai/model-manager.cjs')),...require(path.join(root,'src/ai/local-ai.cjs'))};
