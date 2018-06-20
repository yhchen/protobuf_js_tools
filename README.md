protobuf_js_tools
-----------------

This is a tools for project who use `typescript` + `protobuf` encoding protocol.

What it does:
=============

* Build *.proto files to static js(min.js) and typescript code.
* Support both `client Mode` and `nodejs Mode`
* Auto generate function for `typescript type check`.


How to use:
===========
modify `build_config.json` options
```
{
    "options": {
        "cmt01": [
                "Specifies the target format. Also accepts a path to require a custom target.",
                "        json           JSON representation",
                "        json-module    JSON representation as a module",
                "        proto2         Protocol Buffers, Version 2",
                "        proto3         Protocol Buffers, Version 3",
                "        static         Static code without reflection (non-functional on its own)",
                "        static-module Static code without reflection as a module"
            ],
        "-t": "static-module",
        "--keep-case": false,       "cmt02": "Keeps field casing instead of converting to camel case.",
        "--no-create": true,        "cmt03": "Does not generate create functions used for reflection compatibility.",
        "--no-encode": false,       "cmt04": "Does not generate encode functions.",
        "--no-decode": false,       "cmt05": "Does not generate decode functions.",
        "--no-verify": true,        "cmt06": "Does not generate verify functions.",
        "--no-convert": true,       "cmt07": "Does not generate convert functions like from/toObject",
        "--no-delimited": true,     "cmt08": "Does not generate delimited encode/decode functions.",
        "--no-beautify": false,     "cmt09": "Does not beautify generated code.",
        "--no-comments": false,     "cmt10": "Does not output any JSDoc comments.",
        "--force-long": false,      "cmt11": "Enfores the use of 'Long' for s-/u-/int64 and s-/fixed64 fields.",
        "--force-number": false,    "cmt12": "Enfores the use of 'number' for s-/u-/int64 and s-/fixed64 fields.",
        "--force-message": false,   "cmt13": "Enfores the use of message instances instead of plain objects"
    },
    "defOptions": {
        "-c01": [
            "Gen Mode:",
            "       [Normal]          : Use Package Name and Message Name to Direct proto",
            "       [PackageCmd]      : Use Package Id and Message Id to Direct proto",
            "       [PackageCmdFast]  : Use Package Id and Message Id to Direct proto(faster and shorter than PackageCmd Mode",
            "",
            "For [PackageCmd] [PackageCmdFast] Mode. Use packageID and cmdID mode for network use",
            "        if use packageCmdMode, add //$<ID:number> after package line and message line",
            "        example:",
            "            package Test; //$1",
            "            message Msg //$1",
            "            {",
            "                ...",
            "            }"
            ],
        "GenMode": "PackageCmdFast",
        "packageCmdFmt": "0x%02x%02x",                  "-c02": "package cmd mode id format(for packageageCmdMode=true)",
        "rootModule": "puremvc",                        "-c03": "root module for export file",
        "nodejsMode": true,                             "-c04": "nodejs mode for `export`",
        "importPath": "protobufjs/minimal",             "-c05": "import protobuf file(only available for nodejsMode=true)",
        "outTSFile": "./test/def/proto_def.ts"
    },
    "sourceRoot": "./proto/",
    "outputFile": "./test/static-code/protobuf-static.js",
    "outputTSFile": "./test/static-code/protobuf-static.d.ts"
}
```