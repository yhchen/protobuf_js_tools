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
        "-t": string,
        "--keep-case"?: boolean,    "cmt02": "Keeps field casing instead of converting to camel case.",
        "--no-create"?: boolean,    "cmt03": "Does not generate create functions used for reflection compatibility.",
        "--no-encode"?: boolean,    "cmt04": "Does not generate encode functions.",
        "--no-decode"?: boolean,    "cmt05": "Does not generate decode functions.",
        "--no-verify"?: boolean,    "cmt06": "Does not generate verify functions.",
        "--no-convert"?: boolean,   "cmt07": "Does not generate convert functions like from/toObject",
        "--no-delimited"?: boolean, "cmt08": "Does not generate delimited encode/decode functions.",
        "--no-beautify"?: boolean,  "cmt09": "Does not beautify generated code.",
        "--no-comments"?: boolean,  "cmt10": "Does not output any JSDoc comments.",
        "--force-long"?: boolean,   "cmt11": "Enfores the use of 'Long' for s-/u-/int64 and s-/fixed64 fields.",
        "--force-number"?: boolean, "cmt12": "Enfores the use of 'number' for s-/u-/int64 and s-/fixed64 fields.",
        "--force-message"?: boolean,"cmt13": "Enfores the use of message instances instead of plain objects"
    },
    "defOptions": {
        "-c01": [
            "Gen Mode:",
            "       [Normal]          : Use Package Name and Message Name to Direct proto",
            "       [PackageCmd]      : Use Package Id and Message Id to Direct proto",
            "       [PackageCmdFast]  : Use Package Id and Message Id to Direct proto(faster and shorter than PackageCmd Mode",
            "       [EnumCmd]         : User define PackageName and Id to Direct proto",
            "",
            "For [PackageCmd] [PackageCmdFast] Mode. Define packageID and cmdID before `package` and `message` declaration",
            "        Add //$<ID:number> after package line and message line",
            "        example:",
            "            package Test; //$1",
            "            message Msg //$1",
            "            {",
            "                ...",
            "            }",
            "For [EnumCmd] Mode. Define packageID before `package`",
            "",
            "        Add enum EMessageDef //$<Name:string>:<ID:number> define package_name and package_id.",
            "        Add Enumerators to define MessageId and proto type $<PackageName.MessageName:string>",
            "        If $ProtoName is not defined. there is an empty proto",
            "        example:",
            "            package Test;",
            "            enum EMessageDef //$Test:1",
            "            {",
            "                TestMessage = 1,// add comment here. and add message name at last $Test.TestMsg",
            "                EmptyMessage = 2,// this is an empty message with no proto",
            "            }",
            "            message TestMsg { }",
            ""
            ],
        "GenMode": string,
        "packageCmdFmt": string,        "-c02": "package cmd mode id format(for packageageCmdMode=true)",
        "rootModule": string,        "-c03": "root module for export file",
        "nodejsMode": boolean,          "-c04": "nodejs mode for `export`",
        "importPath"?: string,          "-c05": "import protobuf file(for nodejs)",
        "outTSDefFile": string
    },
    "sourceRoot": string,
    "outputFile": string,
    "outputTSFile": string,
}

```