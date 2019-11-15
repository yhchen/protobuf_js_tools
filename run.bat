@echo off

echo ======================================================
echo = node version is :
CALL node -v
if not "%errorlevel%" == "0" (
	echo "[ERROR] node.js not found!"
	echo "[ERROR] please install node.js first!"
	EXIT 1
)

echo ======================================================
echo = check command typescript
echo = typescript version is :
call tsc -v 2>nul
if not "%errorlevel%" == "0" (
	echo = typescript not found! run install last version of typescript...
	call :ECHO_SPEED_UP_HELP

	call npm install -g typescript
	echo = typescript version is :
	call tsc -v
)

echo ======================================================
echo = check command pbjs
call pbjs .\proto\Login.proto -t static > nul 2>nul
if not "%errorlevel%" == "0" (
	echo pbjs command not found! run install protobufjs...
	call :ECHO_SPEED_UP_HELP

	call npm install -g protobufjs
	call pbjs >nul 2>nul
)

if not EXIST node_modules (
	echo = package.json not init! run npm install...
	call :ECHO_SPEED_UP_HELP

	CALL npm install
)


if not "%1" == "0" (
	echo ======================================================
	echo = tsc compile
	call tsc -p .

	echo ======================================================
	echo = execute build proto

	SET SOURCE_DIR = %2
	SET JS_OUT_DIR = %3
	SET TS_OUT_DIR = %4

	call node ./bin/index.js "%SOURCE_DIR%" "%JS_OUT_DIR%" "%TS_OUT_DIR%"
	pause
)
GOTO :EOF

:ECHO_SPEED_UP_HELP
echo =
echo = If you want to speed up download time in china area.
echo = use this command below:
echo = npm config set registry https://registry.npm.taobao.org
GOTO :EOF
