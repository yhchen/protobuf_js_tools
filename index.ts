import * as chalk from 'chalk';
import * as child_process from 'child_process';
import * as fs from 'fs-extra-promise';
import * as os from 'os';
import * as path from 'path';
import { sprintf } from 'sprintf-js';
import * as UglifyJS from 'uglify-js';
import { isBoolean, isString } from 'util';

declare class String {
	static format(fmt:string, ...replacements: string[]): string;
	static empty(s: string): boolean;
}

if (!String.format) {
	String.format = function(fmt:string, ...replacements: string[]) {
		return fmt.replace(/{(\d+)}/g, function(match, number) {
			return typeof replacements[number] != 'undefined'
			? replacements[number]
			: match
			;
		});
	};
}
if (!String.empty) {
	String.empty = function(s: string) {
		return typeof s === 'string' && s.trim() != '';
	}
}

function NullStr(s: string): boolean {
	if (typeof s === 'string') {
		if (s.trim() != '') {
			return false;
		}
	}
	return true;
}

function FindWords(s: string, otherIncludeWords?: string, start?:number): number {
	const words = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
	for (let i = start?start:0; i < s.length; ++i) {
		if (words.indexOf(s[i]) < 0 && (NullStr(otherIncludeWords) || otherIncludeWords.indexOf(s[i]) < 0)) return i;
	}
	return s.length;
}

const green = chalk.default.greenBright;
const yellow = chalk.default.yellowBright.underline;
const whiteBright = chalk.default.whiteBright;
const redBright = chalk.default.redBright;
const logger = console.log;
function exception(fmt:string, ...args:any[]): void {
	const message = String.format(fmt, ...args);
	logger(redBright(message));
	throw `${message}`;
}


logger(`Current Run Posotion   :${green(process.cwd())}`);
const rootDir = path.resolve(process.cwd());
const execDir = path.resolve(path.dirname(__dirname)); // out bin folder
logger(`root dir    :${green(rootDir)}`);

// 执行指令
function shell(command: string, args: string[]) {
	return new Promise<string>((resolve, reject) => {
		const cmd = command + ' ' + args.join(' ');
		child_process.exec(cmd, (error, stdout, stderr) => {
			if (error) {
				reject(error + stderr);
			}
			else {
				resolve(stdout)
			}
		});
	});
}


type ProtobufConfig = {
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
        "outTSFile": string
    },
    "sourceRoot": string,
    "outputFile": string,
    "outputTSFile": string,
}


const config_file_path = path.join(execDir, './build_config.json');

// load config file
{
	if (!fs.existsSync(config_file_path)) {
		exception(`build config file ${config_file_path} not found`);
	}
	const config_content = fs.readFileSync(config_file_path, 'utf-8');
	var gCfg: ProtobufConfig = JSON.parse(config_content);

	logger(whiteBright(`load config success`));
}

// load fmt file
{
	let fmt_file_path = path.join(execDir, `./fmt/${gCfg.defOptions.GenMode}.fmt`);
	if (!fs.existsSync(fmt_file_path)) {
		exception(`fmt file ${fmt_file_path} not found`);
	}
	var sproto_def_fmt = fs.readFileSync(fmt_file_path, 'utf-8');
	logger(whiteBright(`load fmt file success!`));
}

function fmt_sid(package_id: string, message_id: string): string {
	return sprintf(gCfg.defOptions.packageCmdFmt, parseInt(package_id), parseInt(message_id));
}
function fmt_id(package_id: string, message_id: string): number {
	return parseInt(fmt_sid(package_id, message_id));
}

function format_size(size: number): string {
	if (size < 1024) {
		return `${size}B`;
	} else if (size >= 1024 && size <= 1024*1024) {
		return `${Math.round(size/1024*100)/100}KB`;
	}
	return `${Math.round(size/(1024*1024)*100)/100}MB`;
}

async function generate(_rootDir: string, sourceDir?: string, outJsDir?: string, outTsDir?: string) {
	// init
	if (sourceDir) gCfg.sourceRoot = sourceDir;
	if (outJsDir) gCfg.outputFile = outJsDir;
	if (outTsDir) gCfg.outputTSFile = outTsDir;

	const tempfile = path.join(os.tmpdir(), 'build_proto', 'tmp_' + Date.now() + '.js');
	await fs.mkdirpAsync(path.dirname(tempfile));
	const jsOutFile = path.join(_rootDir, gCfg.outputFile);
	const dirname = path.dirname(jsOutFile);
	await fs.mkdirpAsync(dirname);
	const protoRoot = path.join(_rootDir, gCfg.sourceRoot);
	logger(`proto dir   :${green(protoRoot)}`);
	// find *.proto files
	const fileList = await fs.readdirAsync(protoRoot);
	const protoList = fileList.filter(item => path.extname(item) === '.proto')
	if (protoList.length == 0) {
		exception(`${protoRoot} *.proto not found!`);
	}
	logger(`found .proto:${green(protoList.toString())}`);

	if (gCfg.defOptions.GenMode.indexOf('PackageCmd') == 0) {
			await Promise.all(protoList.map(async (protofile) => {
				const content = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8')
				if (content.indexOf('package') == -1) {
					exception(`${protofile} must have 'package XXX;' declare!`);
				}
			}));
	}

	const args = ['-p', protoRoot, protoList.join(' '), '-o', tempfile];
	for (let _key in gCfg.options) {
		// pass comment line
		if (_key.substr(0, 3) == 'cmt') continue;
		if (isBoolean(gCfg.options[_key])) {
			if (gCfg.options[_key]) {
				args.unshift(_key);
			}
		} else if (isString(gCfg.options[_key])) {
			args.unshift(gCfg.options[_key]);
			args.unshift(_key);
		}
	}
	await shell('pbjs', args);
	let pbjsResult = await fs.readFileAsync(tempfile, 'utf-8');
	if (!gCfg.defOptions.nodejsMode) {
		pbjsResult = `var $protobuf = window.protobuf;\n$protobuf.roots.default=window;\n` + pbjsResult;
	} else {
		// pbjsResult = `var $protobuf = require('protobufjs');\n` + pbjsResult;
		pbjsResult = pbjsResult;// do nothing
	}
	logger(`gen js file :${green(jsOutFile)}`);
	logger(`file size   :${yellow(format_size(pbjsResult.length))}`);
	await fs.writeFileAsync(jsOutFile, pbjsResult, 'utf-8');
	// gen min js
	const minjs = UglifyJS.minify(pbjsResult);
	let jsMinOutFile = jsOutFile.substr(0, jsOutFile.lastIndexOf('.js')) + '.min.js';
	logger(`gen min.js  : ${green(jsMinOutFile)}`);
	logger(`file size   :${yellow(format_size(minjs.code.length))}`);
	await fs.writeFileAsync(jsMinOutFile, minjs.code, 'utf-8');
	// gen .d.ts file
	await shell('pbts', ['--main', jsOutFile, '-o', tempfile]);
	let pbtsResult = await fs.readFileAsync(tempfile, 'utf-8');
	if (gCfg.defOptions.nodejsMode) {
		pbtsResult = `/// <reference types='protobufjs' />';\n\n` + pbtsResult;
	}
	pbtsResult = pbtsResult.replace(/: Long;/gi, ': protobuf.Long;').replace(/(number\|Long)/gi, '(number|protobuf.Long)');
	pbtsResult = pbtsResult.replace(/\$protobuf/gi, 'protobuf');
	if (!gCfg.defOptions.nodejsMode) {
		pbtsResult = pbtsResult.replace(/export namespace/gi, 'declare namespace');
		// if (pbtsResult.indexOf('namespace') < 0) {
		// 	pbtsResult = pbtsResult.replace(/export class/g, 'declare class').replace(/export interface/g, 'interface');
		// }
		pbtsResult = pbtsResult.replace(/export class/g, 'declare class').replace(/export interface/g, 'interface');
	}
	let tsOutFile = gCfg.outputTSFile ? path.join(_rootDir, gCfg.outputTSFile) : jsOutFile.substr(0, jsOutFile.lastIndexOf('.js')) + '.d.ts';
	logger(`gen ts file :${green(tsOutFile)}`);
	logger(`file size   :${yellow(format_size(pbtsResult.length))}`);
	await fs.mkdirpAsync(path.dirname(tsOutFile));
	await fs.writeFileAsync(tsOutFile, pbtsResult, 'utf-8');
	await fs.removeAsync(tempfile);
	// gen encode decode and type check code & save file
	if (!NullStr(gCfg.defOptions.outTSFile))
	{
		let sproto_file_content = null;
		switch (gCfg.defOptions.GenMode)
		{
		case "Normal":
			sproto_file_content = await gen_NormalMode_content(protoRoot, protoList);
			break;
		case "PackageCmd":
			sproto_file_content = await gen_packageCmdMode_content(protoRoot, protoList);
			break;
		case "PackageCmdFast":
			sproto_file_content = await gen_packageCmdFastMode_content(protoRoot, protoList);
			break;
		case "EnumCmd":
			sproto_file_content = await gen_EnumCmdMode_content(protoRoot, protoList);
			break;
		}
		const tsCodeFilePath = path.join(_rootDir, gCfg.defOptions.outTSFile);
		await fs.mkdirpAsync(path.dirname(tsCodeFilePath));
		await fs.writeFileAsync(tsCodeFilePath, sproto_file_content, {encoding:'utf-8', flag:'w+'});
		logger(`gen ts file :${green(tsCodeFilePath)}`);
		logger(`file size   :${yellow(format_size(sproto_file_content.length))}`);
	}

	logger(whiteBright(`***********************************************`));
	logger(whiteBright(`*               done with all                 *`));
	logger(whiteBright(`***********************************************`));
}

////////////////////////////////////////////////////////////////////////////////
const def_package_line = 'package';
const def_message_line = 'message';
const def_no_package_name = '__None_NameSpace__';
const def_mask_flag = '//$';

type PackageCmdModeDef = {
	[package_id: number]: {
		package_name: string,
		commemt?: string,
		message_list : {
			[message_id: number]: { message_name: string, imessage_name: string, comment?: string }
		}
	}
};

async function generate_packageCmdMode_tables(protoRoot: string, protoFileList: string[]) {
	let package_def: PackageCmdModeDef = { };
	for (let protofile of protoFileList) {
		let fcontent = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8');
		let lines = fcontent.split('\n');
		let package_id = 0;
		let lastline = '';
		let line = '';
		// find package first
		while (lines.length > 0) {
			lastline = line;
			line = lines.shift().trim();
			// not package line
			if (line.substr(0, def_package_line.length) != def_package_line) {
				continue;
			}
			if (!line.includes(def_mask_flag)) {
				exception(`proto file ${protofile} package id not found`);
			}
			line = line.substr(def_package_line.length).trim();
			const package_name = line.substr(0, line.indexOf(';')).trim();
			const spackage_id = line.substr(line.indexOf(def_mask_flag) + def_mask_flag.length).trim();
			package_id = parseInt(spackage_id);
			if (package_def[package_id]) {
				exception(`package id:${yellow(package_id.toString())} redefined `
					+ `at [${yellow(package_name)}] [${yellow(package_def[package_id].package_name)}]`);
			}
			package_def[package_id] = { package_name, message_list:{} };
			lastline = lastline.trim();
			if (lastline.indexOf('//') == 0) {
				package_def[package_id].commemt = lastline;
			}
			break;
		}

		lastline = line = '';
		// find message
		while (lines.length > 0) {
			lastline = line;
			line = lines.shift().trim();
			// not message line
			if (line.substr(0, def_message_line.length) != def_message_line) {
				continue;
			}
			if (!line.includes(def_mask_flag)) {
				continue;
				// exception(`proto file ${protofile} message id not found line:\n${line}`);
			}
			line = line.substr(def_message_line.length).trim();
			const message_name = line.substr(0, FindWords(line)).trim();
			const imessage_name = 'I' + message_name;
			const smessage_id = line.substr(line.indexOf(def_mask_flag) + def_mask_flag.length).trim();
			const message_id = parseInt(smessage_id);
			const message_list = package_def[package_id].message_list;
			if (message_list[message_id]) {
				const package_name = package_def[package_id].package_name + '.';
				exception(`[${redBright('Message ID Redefined')}] message id:${yellow(message_id.toString())} redefined `
					+ `at [${yellow(package_name + message_list[message_id].message_name)}] [${yellow(package_name + message_name)}]`);
			}
			message_list[message_id] = {message_name, imessage_name};
			lastline = lastline.trim();
			if (lastline.indexOf('//') == 0) {
				message_list[message_id].comment = lastline;
			}
		}
	}

	// logger(yellow(JSON.stringify(package_def)));
	return package_def;
}

async function gen_packageCmdMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def: PackageCmdModeDef = await generate_packageCmdMode_tables(protoRoot, protoFileList);
	let sproto_IMsgMap = '';
	let sproto_SCHandlerMap = '';
	let sproto_HandlerMap = '';
	const sproto_protobuf_import = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath) ? 'p.' : '';
	const fmt_package = function(sysid: string, comment?: string):string { return `${comment?'\t'+comment+'\n':''}\t'${sysid}': {\n`; }
	const fmt_type_package = function(sysid: string, comment?: string):string { return `${comment?'\t'+comment+'\n':''}\t${sysid}: {\n`; }
	const fmt_message = function(cmdid: string, package_name: string, message_name: string, comment?: string): string {
		return `${comment?'\t\t'+comment+'\n':''}\t\t'${cmdid}': ${sproto_protobuf_import}${package_name}.${message_name},\n`;
	}
	const fmt_type_message = function(sysid: string, cmdid: string, package_name: string, msgname: string, comment?: string): string {
		return `${comment?'\t\t'+comment+'\n':''}\t\t${msgname}: <IHandler<'${sysid}', '${cmdid}'>>{s: '${sysid}', c: '${cmdid}', ns: ${sysid}, nc: ${cmdid}, `
					+ `pt: ${sproto_protobuf_import}${package_name}.${msgname} },\n`;
	}


	for (let package_id in package_def) {
		sproto_IMsgMap += fmt_package(package_id/*, package_def[package_id].commemt*/);
		sproto_SCHandlerMap += fmt_package(package_id/*, package_def[package_id].commemt*/);
		sproto_HandlerMap += fmt_type_package(package_def[package_id].package_name, package_def[package_id].commemt);
		const p_def = package_def[package_id];
		for (let cmd_id in p_def.message_list) {
			sproto_IMsgMap += fmt_message(cmd_id, p_def.package_name, p_def.message_list[cmd_id].imessage_name);
			sproto_SCHandlerMap += fmt_message(cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name);
			sproto_HandlerMap += fmt_type_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name, p_def.message_list[cmd_id].comment);
		}
		sproto_IMsgMap += '\t},\n';
		sproto_SCHandlerMap += '\t},\n';
		sproto_HandlerMap += '\t},\n';
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? 'export ' : '';
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
						? `import * as protobuf from '${gCfg.defOptions.importPath}';protobuf;\n`
						: '';
	const sproto_reference_content = gCfg.defOptions.nodejsMode
						? `import * as p from '${path.relative(path.dirname(gCfg.defOptions.outTSFile), gCfg.outputFile).replace(/\\/g, '/')}';\n`
						: '';
	const sproto_module_head = !NullStr(gCfg.defOptions.rootModule)
						? `${sproto_export}module ${gCfg.defOptions.rootModule} {\n`
						: '';
	const sproto_module_tail = !NullStr(gCfg.defOptions.rootModule) ? '}\n' : '';
	const sproto_export_module = !NullStr(gCfg.defOptions.rootModule) || gCfg.defOptions.nodejsMode ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_module_head,
		sproto_IMsgMap,
		sproto_SCHandlerMap,
		sproto_HandlerMap,
		sproto_module_tail,
		sproto_export_module
	);
	return sproto_file_content;
}

async function gen_packageCmdFastMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def: PackageCmdModeDef = await generate_packageCmdMode_tables(protoRoot, protoFileList);
	let sproto_IMsgMap = '';
	let sproto_SCHandlerMap = '';
	let sproto_HandlerMap = '';
	const sproto_protobuf_import = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath) ? 'p.' : '';
	const fmt_package = function(packageName: string, comment?: string):string { return `\t// ${packageName}\n${comment?'\t'+comment+'\n':''}`; }
	const fmt_type_package = function(packageName: string, comment?: string):string { return `\t// ${packageName}\n${comment?'\t'+comment+'\n':''}\t${packageName}: {\n`; }
	const fmt_message = function(sysid: string, cmdid: string, package_name: string, message_name: string, comment?: string): string {
		return `${comment?'\t'+comment+'\n':''}\t'${fmt_sid(sysid, cmdid)}': ${sproto_protobuf_import}${package_name}.${message_name},\n`;
	}
	const fmt_type_message = function(sysid: string, cmdid: string, package_name: string, msgname: string, comment?: string): string {
		return `${comment?'\t\t'+comment+'\n':''}\t\t${msgname}: <IHandler<'${fmt_sid(sysid, cmdid)}'>>{sid: '${fmt_sid(sysid, cmdid)}', id: ${fmt_id(sysid, cmdid)}, `
					+ `pt: ${sproto_protobuf_import}${package_name}.${msgname} },\n`;
	}


	for (let package_id in package_def) {
		const p_def = package_def[package_id];
		sproto_IMsgMap += fmt_package(p_def.package_name/*, package_def[package_id].commemt*/);
		sproto_SCHandlerMap += fmt_package(p_def.package_name/*, package_def[package_id].commemt*/);
		sproto_HandlerMap += fmt_type_package(p_def.package_name, package_def[package_id].commemt);
		for (let cmd_id in p_def.message_list) {
			sproto_IMsgMap += fmt_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].imessage_name);
			sproto_SCHandlerMap += fmt_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name);
			sproto_HandlerMap += fmt_type_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name, p_def.message_list[cmd_id].comment);
		}
		sproto_HandlerMap += `\t},\n`;
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? 'export ' : '';
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
						? `import * as protobuf from '${gCfg.defOptions.importPath}';protobuf;\n`
						: '';
	const sproto_reference_content = gCfg.defOptions.nodejsMode
						? `import * as p from '${path.relative(path.dirname(gCfg.defOptions.outTSFile), gCfg.outputFile).replace(/\\/g, '/')}';\n`
						: '';
	const sproto_module_head = !NullStr(gCfg.defOptions.rootModule)
						? `${sproto_export}module ${gCfg.defOptions.rootModule} {\n`
						: '';
	const sproto_module_tail = !NullStr(gCfg.defOptions.rootModule) ? '}\n' : '';
	const sproto_export_module = !NullStr(gCfg.defOptions.rootModule) || gCfg.defOptions.nodejsMode ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_module_head,
		sproto_IMsgMap,
		sproto_SCHandlerMap,
		sproto_HandlerMap,
		sproto_module_tail,
		sproto_export_module
	);
	return sproto_file_content;
}

type NormalModeDef = {
	[package_name: string]: {
		message_list : { name: string, comment?: string }[],
		comment?: string,
	},
	[def_no_package_name]: {
		message_list: { name: string, comment?: string }[],
		comment?: string,
	}
};

async function generate_NormalMode_tables(protoRoot: string, protoFileList: string[]) {
	let package_def: NormalModeDef = { [def_no_package_name]:{message_list:[]} };
	for (let protofile of protoFileList) {
		let fcontent = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8');
		let lines = fcontent.split('\n');
		// find package first
		let package_name = def_no_package_name;
		let found_package = false;
		let index = 0;
		let lastline = '';
		let line = '';
		for (; index < lines.length; ++index) {
			lastline = line;
			line = lines[index].trim();
			// not package line
			if (line.substr(0, def_package_line.length) != def_package_line) {
				continue;
			}
			line = line.substr(def_package_line.length).trim();
			package_name = line.substr(0, line.indexOf(';')).trim();
			if (package_def[package_name]) {
				exception(`package name:${yellow(package_name)} redefined `);
			}
			package_def[package_name] = { message_list:[] };
			found_package = true;
			lastline = lastline.trim();
			if (lastline.indexOf('//') == 0) {
				package_def[package_name].comment = lastline;
			}
			break;
		}

		if (!found_package) {
			index = 0;
		}

		lastline = line = '';
		// find message
		for (; index < lines.length; ++index) {
			lastline = line;
			line = lines[index].trim();
			// not message line
			if (line.substr(0, def_message_line.length) != def_message_line) {
				continue;
			}
			line = line.substr(def_message_line.length).trim();
			const message_name = line.substr(0, FindWords(line)).trim();

			lastline = lastline.trim();
			if (lastline.indexOf('//') == 0) {
				package_def[package_name].message_list.push({name:message_name, comment:lastline});
			} else {
				package_def[package_name].message_list.push({name:message_name});
			}
		}
	}
	return package_def;
}

async function gen_NormalMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def = await generate_NormalMode_tables(protoRoot, protoFileList);
	const sproto_protobuf_import = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath) ? 'p.' : '';
	let sproto_INotifyType = '';
	let sproto_NotifyType = '';

	let package_count = 0;
	for (let _ in package_def)
	{
		++package_count;
	}
	logger(yellow(package_count.toString()));

	for (let pname in package_def) {
		if (package_def[pname].comment) {
			// TODO : Add Package Comment
		}
		for (let cmessage of package_def[pname].message_list) {
			const cname = cmessage.name;
			if (pname != def_no_package_name) {
				if (package_count <= 2) {
					sproto_INotifyType += `\t'${cname}': ${sproto_protobuf_import}${pname}.I${cname},${cmessage.comment? '\t' + cmessage.comment : ''}\n`;
					sproto_NotifyType += `${cmessage.comment?'\t'+cmessage.comment+'\n':''}\t${cname}: '${cname}',\n`;
				} else {
					sproto_INotifyType += `\t'${pname}_${cname}': ${sproto_protobuf_import}${pname}.I${cname},${cmessage.comment? '\t' + cmessage.comment : ''}\n`;
					sproto_NotifyType += `${cmessage.comment?'\t'+cmessage.comment+'\n':''}\t${pname}_${cname}: '${pname}_${cname}',\n`;
				}
			} else {
				sproto_INotifyType += `\t'${cname}': ${sproto_protobuf_import}I${cname},\n`;
				sproto_NotifyType += `${cmessage.comment?'\t'+cmessage.comment+'\n':''}\t${cname}: '${cname}',\n`;
			}
		}
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? 'export ' : '';
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
						? `import * as protobuf from '${gCfg.defOptions.importPath}';protobuf;\n`
						: '';
	const sproto_reference_content = gCfg.defOptions.nodejsMode
						? `import * as p from '${path.relative(path.dirname(gCfg.defOptions.outTSFile), gCfg.outputFile).replace(/\\/g, '/')}';\n`
						: '';
	const sproto_module_head = !NullStr(gCfg.defOptions.rootModule)
						? `${sproto_export}module ${gCfg.defOptions.rootModule} {\n`
						: '';
	const sproto_module_tail = !NullStr(gCfg.defOptions.rootModule) ? '}\n' : '';
	const sproto_export_module = !NullStr(gCfg.defOptions.rootModule) ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_module_head,
		sproto_INotifyType,
		sproto_NotifyType,
		sproto_module_tail,
		sproto_export_module,
	);
	return sproto_file_content;
}

type EnumCmdModeDef = {
	[package_name: string]: {
		package_id: number,
		message_list : Map<string, {name: string, id: number, proto: string, comment?: string}>,
		comment?: string,
	}
};

async function generate_EnumCmdMode_tables(protoRoot: string, protoFileList: string[]) {
	let package_def: EnumCmdModeDef = {};
	for (let protofile of protoFileList) {
		let fcontent = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8');
		let lines = fcontent.split('\n');
		let lastline = '';
		let line = '';
		let package_name = '';

		const def_enum_message_line = 'enum EMessageDef';
		// find package first
		let line_num = 0;
		while (lines.length > 0) {
			++line_num;
			lastline = line;
			line = lines.shift().trim();
			const originline = line;
			line = line.replace(/\t/g, ' ').replace(/( +)/g, ' ');
			if (line.indexOf('//') == 0) {
				line = line.substr(line.indexOf('//') + 2).trim();
			}
			// not package line
			if (line.substr(0, def_enum_message_line.length) != def_enum_message_line) {
				continue;
			}
			let mask_idx = line.indexOf(def_mask_flag);
			if (mask_idx < 0) {
				exception(`proto file format error at [${yellow(protofile+':'+line_num.toString())}] :\n${redBright(originline)}`);
			}
			line = line.substr(mask_idx+def_mask_flag.length);
			let last_space = line.lastIndexOf(' ');
			if (last_space >= 0)
			{
				line = line.substr(0, last_space);
			}
			let sPackage_Name_Id = line.split(':');
			if (sPackage_Name_Id.length != 2) {
				exception(`proto file format error at [${yellow(protofile+':'+line_num.toString())}] :\n${redBright(originline)}`);
			}
			package_name = sPackage_Name_Id[0].trim();
			const package_id = parseInt(sPackage_Name_Id[1].trim());
			if (package_id <= 0) {
				exception(`proto file package id error at [${yellow(protofile+':'+line_num.toString())}] :\n${redBright(originline)}`);
			}

			if (package_def[package_name] == undefined) {
				package_def[package_name] = {package_id, message_list:new Map<string, {name: string, id: number, proto: string, comment?: string}>()};
			}
			if (lastline.trim().indexOf('//') == 0) {
				package_def[package_name].comment = lastline.trim();
			}
			break;
		}

		// enum not found...
		if (lines.length <= 0) {
			continue;
		}

		const message_list = package_def[package_name].message_list;

		lastline = line = '';
		let last_message_id = -1;
		// find message
		while (lines.length > 0) {
			++line_num;
			lastline = line;
			line = lines.shift().trim();
			const originline = line;
			// not message line
			if (line.indexOf('//') == 0) {
				line = line.substr(line.indexOf('//') + 2).trim();
			}
			// end enum
			if (line[0] == '}') {
				break;
			}
			if (line.length <= 2 || line.indexOf(';') < 0) {
				continue;
			}
			let separete_idx = line.indexOf(';');
			if (separete_idx < 0) {
				exception(`proto file message id error at [${yellow(protofile+':'+line_num.toString())}] :\n${redBright(originline)}`);
			}
			const sMessage_Name_Id = line.substr(0, separete_idx).split('=');
			let message_name = sMessage_Name_Id[0].trim();
			let message_id = ++last_message_id;
			if (sMessage_Name_Id.length >= 2) {
				message_id = last_message_id = parseInt(sMessage_Name_Id[1].trim());
			}

			line = line.substr(separete_idx+1);
			let sComment: string = undefined;
			let proto_name: string = null;
			const comment_idx = line.indexOf('//');
			if (comment_idx >= 0) {
				sComment = line.substr(comment_idx);
				const proto_start_idx = sComment.indexOf('$') + 1;
				if (proto_start_idx > 0) {
					const proto_end_idx = FindWords(sComment, '.', proto_start_idx);
					if (proto_end_idx > proto_start_idx) {
						proto_name = sComment.substr(proto_start_idx, proto_end_idx - proto_start_idx);
					}
					sComment = (sComment.substr(0, proto_start_idx-1).trim() + ' ' + sComment.substr(proto_end_idx).trim()).trim();
				}
			}
			if (message_list.has(message_name)) {
				exception(`[${redBright('Message ID Redefined')}] message id:${yellow(message_id.toString())} redefined `
					+ `at [${yellow(package_name + message_list[message_name].name)}] [${yellow(package_name + message_name)}]`);
			}
			message_list.set(message_name, {name:message_name, id:message_id, proto:proto_name, comment:sComment});
		}
	}

	// logger(yellow(JSON.stringify(package_def)));
	return package_def;
}

async function gen_EnumCmdMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def: EnumCmdModeDef = await generate_EnumCmdMode_tables(protoRoot, protoFileList);
	let sproto_IMsgMap = '';
	let sproto_SCHandlerMap = '';
	let sproto_HandlerMap = '';
	const sproto_protobuf_import = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath) ? 'p.' : '';
	const fmt_package = function(pname: string, comment?: string):string { return `${comment?'\t'+comment+'\n':''}\t'${pname}': {\n`; }
	const fmt_type_package = function(pname: string, comment?: string):string { return `${comment?'\t'+comment+'\n':''}\t${pname}: {\n`; }
	const fmt_message = function(message_name: string, protoname: string, comment?: string): string {
		return `\t\t'${message_name}': ${!protoname?'':sproto_protobuf_import}${protoname},${comment?'\t'+comment:''}\n`;
	}
	const fmt_type_message = function(package_name: string, message_name: string, protoname: string, package_id: string, message_id: string, comment?: string): string {
		return `\t\t${message_name}: <IHandler<'${package_name}', '${message_name}'>>`
					+ `{p: '${package_name}', m: '${message_name}', sid: '${fmt_sid(package_id, message_id)}', `
					+ `mid: ${fmt_id(package_id, message_id)}, pt: ${!protoname?'':sproto_protobuf_import}${protoname} },${comment?'\t'+comment:''}\n`;
	}

	for (let package_name in package_def) {
		const p_def = package_def[package_name];
		sproto_IMsgMap += fmt_package(package_name, p_def.comment);
		sproto_SCHandlerMap += fmt_package(p_def.package_id.toString(), p_def.comment);
		sproto_HandlerMap += fmt_type_package(package_name, p_def.comment);
		for (let iter of p_def.message_list) {
			const message_name = iter[0];
			const m_def = iter[1];
			sproto_IMsgMap += fmt_message(message_name, m_def.proto, m_def.comment);
			sproto_SCHandlerMap += fmt_message(m_def.id.toString(), m_def.proto, m_def.comment);

			sproto_HandlerMap += fmt_type_message(package_name, message_name, m_def.proto, p_def.package_id.toString(), m_def.id.toString(), m_def.comment);
		}
		sproto_IMsgMap += '\t},\n';
		sproto_SCHandlerMap += '\t},\n';
		sproto_HandlerMap += '\t},\n';
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? 'export ' : '';
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
						? `import * as protobuf from '${gCfg.defOptions.importPath}';protobuf;\n`
						: '';
	const sproto_reference_content = gCfg.defOptions.nodejsMode
						? `import * as p from '${path.relative(path.dirname(gCfg.defOptions.outTSFile), gCfg.outputFile).replace(/\\/g, '/')}';\n`
						: '';
	const sproto_module_head = !NullStr(gCfg.defOptions.rootModule)
						? `${sproto_export}module ${gCfg.defOptions.rootModule} {\n`
						: '';
	const sproto_module_tail = !NullStr(gCfg.defOptions.rootModule) ? '}\n' : '';
	const sproto_export_module = !NullStr(gCfg.defOptions.rootModule) || gCfg.defOptions.nodejsMode ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_module_head,
		sproto_IMsgMap,
		'',//{4} is empty
		sproto_SCHandlerMap,
		sproto_HandlerMap,
		sproto_module_tail,
		sproto_export_module
	);
	return sproto_file_content;
}

// main entry
generate(rootDir, process.argv[2], process.argv[3], process.argv[4]);
