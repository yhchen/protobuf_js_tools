@echo off

echo ======================================================
echo = node version is :
CALL node -v
echo = 
echo = If you want to speed up download time in china area.
echo = use this command below:
echo = npm config set registry https://registry.npm.taobao.org

echo ======================================================
echo = init npm env
pushd bin
CALL npm install
popd

echo ======================================================
echo = install uglify fs-extra eslint tslint
CALL npm install -g uglify fs-extra-promise fs-extra eslint tslint
echo = install protobuf.js
CALL npm install -g protobufjs
echo = init pbjs first run
CALL pbjs

echo =
echo = 
echo ==============================
echo =      INSTALL FINISH!       =
echo ==============================

pause