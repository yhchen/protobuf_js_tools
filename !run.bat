@echo off

echo ======================================================
echo = node version is :
CALL node -v
if not "%errorlevel%" == "0" (
	echo "[ERROR] node.js not found!"
	echo "[ERROR] please install node.js first!"
	EXIT 1
)
echo =
echo = If you want to speed up download time in china area.
echo = use this command below:
echo = npm config set registry https://registry.npm.taobao.org

echo ======================================================
echo = check command typescript
call tsc -v > nul 2>nul
if not "%errorlevel%" == "0" (
	call npm install -g typescript
	echo = typescript version is :
	call tsc -v
)

echo ======================================================
echo = check command pbjs
call pbjs test\proto\Login.proto -t static > nul 2>nul
if not "%errorlevel%" == "0" (
	call npm install -g protobufjs
	call pbjs >nul 2>nul
)

if not EXIST node_modules (
	echo = run npm install
	CALL npm install
)

echo ======================================================
echo = tsc compile
call tsc -p .

echo ======================================================
echo = execute build proto
call node ./bin/index.js

pause
