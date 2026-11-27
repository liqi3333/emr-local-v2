@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未找到 Node.js，请先安装 Node.js 18+ ^(https://nodejs.org^)
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install --no-audit --no-fund
)

if not exist .env (
  echo 未找到 .env，正在从 .env.example 创建...
  copy .env.example .env >nul
)

echo 正在启动电子病历系统： http://localhost:8000
start "" http://localhost:8000
node server.js
