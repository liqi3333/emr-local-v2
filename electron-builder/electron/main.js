const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');

// 数据目录：用户 data 目录下
const USER_DATA_PATH = app.getPath('userData');
const DATA_DIR = path.join(USER_DATA_PATH, 'data');

// 设置环境变量，让 database.js 使用正确的数据目录
process.env.EMR_DATA_DIR = DATA_DIR;

let mainWindow = null;
let server = null;
let PORT = 8000;

// ── 动态分配端口 ──
async function findAvailablePort() {
  const net = require('net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── 启动 Express 服务器 ──
async function startServer() {
  PORT = await findAvailablePort();
  
  const appExpress = express();
  appExpress.use(cors({ origin: true, credentials: true }));
  appExpress.use(express.json({ limit: '10mb' }));
  appExpress.use(express.urlencoded({ extended: true }));

  // 静态文件 - 从 resources/app 目录加载
  const appPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '../..');
  appExpress.use(express.static(path.join(appPath, 'public')));

  // 加载后端路由
  const apiRouter = require(path.join(appPath, 'src/routes/api'));
  const crudRouter = require(path.join(appPath, 'src/routes/crud'));
  const promptsRouter = require(path.join(appPath, 'src/routes/prompts'));
  const recordTypesRouter = require(path.join(appPath, 'src/routes/recordTypes'));
  const settingsRouter = require(path.join(appPath, 'src/routes/settings'));
  const diseasesRouter = require(path.join(appPath, 'src/routes/diseases'));
  const knowledgeRouter = require(path.join(appPath, 'src/routes/knowledge'));
  const evolutionRouter = require(path.join(appPath, 'src/routes/evolution'));

  appExpress.use('/api', apiRouter);
  appExpress.use('/api', crudRouter);
  appExpress.use('/api', promptsRouter);
  appExpress.use('/api', recordTypesRouter);
  appExpress.use('/api', settingsRouter);
  appExpress.use('/api', diseasesRouter);
  appExpress.use('/api', knowledgeRouter);
  appExpress.use('/api', evolutionRouter);

  // 页面路由
  appExpress.get('/prompts', (req, res) => {
    res.sendFile(path.join(appPath, 'public', 'prompts.html'));
  });
  appExpress.get('/record-types', (req, res) => {
    res.sendFile(path.join(appPath, 'public', 'record-types.html'));
  });
  appExpress.get('/diseases', (req, res) => {
    res.sendFile(path.join(appPath, 'public', 'diseases.html'));
  });

  // SPA fallback
  appExpress.get('*', (req, res) => {
    res.sendFile(path.join(appPath, 'public', 'index.html'));
  });

  // 初始化注册表
  const { ensureDefaultRegistry, migrateLegacyTypes } = require(path.join(appPath, 'src/services/recordRegistry'));
  const { ensureDefaultDiseaseCategories } = require(path.join(appPath, 'src/services/diseaseRegistry'));
  ensureDefaultRegistry();
  migrateLegacyTypes();
  ensureDefaultDiseaseCategories();

  // 启动服务器
  return new Promise((resolve) => {
    server = appExpress.listen(PORT, () => {
      console.log(`[EMR v2] Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

// ── 创建主窗口 ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '电子病历系统 v2',
    show: false, // 先隐藏，加载完成后再显示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 加载本地服务器
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 内容加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发模式打开 DevTools
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC 通信 ──
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-user-data-path', () => USER_DATA_PATH);

// ── 自动更新（可选） ──
let autoUpdater = null;
function setupAutoUpdater() {
  if (!app.isPackaged) return; // 开发模式跳过

  try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `版本 ${info.version} 可用，正在下载...`,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '更新已就绪',
        message: '新版本已下载完成，是否重启安装？',
        buttons: ['重启', '稍后'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('Update error:', err);
    });

    // 启动 3 秒后检查更新
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
  } catch (e) {
    console.log('electron-updater not available, skipping auto-update');
  }
}

// ── 应用生命周期 ──
app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
    setupAutoUpdater();
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
