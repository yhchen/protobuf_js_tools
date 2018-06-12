import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra-promise';
import * as UglifyJS from 'uglify-js';
import * as os from 'os';
import * as chalk from 'chalk';
import { isString, isBoolean } from 'util';
import { sprintf } from 'sprintf-js'

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

function FindWords(s: string, start?:number): number {
	const words = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
	for (let i = start?start:0; i < s.length; ++i) {
		if (words.indexOf(s[i]) < 0) return i;
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


logger(`__dirname   :${green(__dirname)}`);
const rootDir = path.resolve(__dirname, '../');// for bin dir
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
        "GenMode": string,
        "packageCmdFmt": string,        "-c02": "package cmd mode id format(for packageageCmdMode=true)",
        "rootNamespace": string,        "-c03": "root namespace for export file",
        "nodejsMode": boolean,          "-c04": "nodejs mode for `export`",
        "importPath"?: string,          "-c05": "import protobuf file(for nodejs)",
        "outTSFile": string
    },
    "sourceRoot": string,
    "outputFile": string,
    "outputTSFile": string,
}


const config_file_path = './build_config.json'

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
	let fmt_file_path: string = `./fmt/${gCfg.defOptions.GenMode}.fmt`;
	if (!fs.existsSync(fmt_file_path)) {
		exception(`fmt file ${fmt_file_path} not found`);
	}
	var sproto_def_fmt = fs.readFileSync(fmt_file_path, 'utf-8');
	logger(whiteBright(`load fmt file success!`));
}

function format_size(size: number): string {
	if (size < 1024) {
		return `${size}B`;
	} else if (size >= 1024 && size <= 1024*1024) {
		return `${Math.round(size/1024*100)/100}KB`;
	}
	return `${Math.round(size/(1024*1024)*100)/100}MB`;
}

async function generate(_rootDir: string) {
	// init
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
		if (pbtsResult.indexOf('namespace') < 0) {
			pbtsResult = pbtsResult.replace(/export class/g, 'declare class').replace(/export interface/g, 'interface');
		}
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
	const mask_flag = '//$';
	const package_line = 'package';
	const message_line = 'message';
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
			if (line.substr(0, package_line.length) != package_line) {
				continue;
			}
			if (!line.includes(mask_flag)) {
				exception(`proto file ${protofile} package id not found`);
			}
			line = line.substr(package_line.length).trim();
			const package_name = line.substr(0, line.indexOf(';')).trim();
			const spackage_id = line.substr(line.indexOf(mask_flag) + mask_flag.length).trim();
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
			if (line.substr(0, message_line.length) != message_line) {
				continue;
			}
			if (!line.includes(mask_flag)) {
				exception(`proto file ${protofile} message id not found line:\n${line}`);
			}
			line = line.substr(message_line.length).trim();
			const message_name = line.substr(0, FindWords(line)).trim();
			const imessage_name = 'I' + message_name;
			const smessage_id = line.substr(line.indexOf(mask_flag) + mask_flag.length).trim();
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

type NormalModeDef = {
	[package_name: string]: {
		message_list : { name: string, comment?: string }[],
		comment?: string,
	},
	'__None_NameSpace__': {
		message_list: { name: string, comment?: string }[],
		comment?: string,
	}
};

async function generate_NormalMode_tables(protoRoot: string, protoFileList: string[]) {
	let package_def: NormalModeDef = { '__None_NameSpace__':{message_list:[]} };
	const package_line = 'package';
	const message_line = 'message';
	for (let protofile of protoFileList) {
		let fcontent = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8');
		let lines = fcontent.split('\n');
		// find package first
		let package_name = '__None_NameSpace__';
		let found_package = false;
		let index = 0;
		let lastline = '';
		let line = '';
		for (; index < lines.length; ++index) {
			lastline = line;
			line = lines[index].trim();
			// not package line
			if (line.substr(0, package_line.length) != package_line) {
				continue;
			}
			line = line.substr(package_line.length).trim();
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
			if (line.substr(0, message_line.length) != message_line) {
				continue;
			}
			line = line.substr(message_line.length).trim();
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
			if (pname != '__None_NameSpace__') {
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
	const sproto_namespace_head = !NullStr(gCfg.defOptions.rootNamespace)
						? `${sproto_export}namespace ${gCfg.defOptions.rootNamespace} {\n`
						: '';
	const sproto_namespace_tail = !NullStr(gCfg.defOptions.rootNamespace) ? '}\n' : '';
	const sproto_export_namespace = !NullStr(gCfg.defOptions.rootNamespace) ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_namespace_head,
		sproto_INotifyType,
		sproto_NotifyType,
		sproto_namespace_tail,
		sproto_export_namespace,
	);
	return sproto_file_content;
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
	const sproto_namespace_head = !NullStr(gCfg.defOptions.rootNamespace)
						? `${sproto_export}namespace ${gCfg.defOptions.rootNamespace} {\n`
						: '';
	const sproto_namespace_tail = !NullStr(gCfg.defOptions.rootNamespace) ? '}\n' : '';
	const sproto_export_namespace = !NullStr(gCfg.defOptions.rootNamespace) || gCfg.defOptions.nodejsMode ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_namespace_head,
		sproto_IMsgMap,
		sproto_SCHandlerMap,
		sproto_HandlerMap,
		sproto_namespace_tail,
		sproto_export_namespace
	);
	return sproto_file_content;
}

async function gen_packageCmdFastMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def: PackageCmdModeDef = await generate_packageCmdMode_tables(protoRoot, protoFileList);
	let sproto_IMsgMap = '';
	let sproto_SCHandlerMap = '';
	let sproto_HandlerMap = '';
	const sproto_protobuf_import = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath) ? 'p.' : '';
	const fmt_sid = function(sysid: string, cmdid: string): string { return sprintf(gCfg.defOptions.packageCmdFmt, parseInt(sysid), parseInt(cmdid)); }
	const fmt_id = function(sysid: string, cmdid: string): number { return parseInt(fmt_sid(sysid, cmdid)); }
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
	const sproto_namespace_head = !NullStr(gCfg.defOptions.rootNamespace)
						? `${sproto_export}namespace ${gCfg.defOptions.rootNamespace} {\n`
						: '';
	const sproto_namespace_tail = !NullStr(gCfg.defOptions.rootNamespace) ? '}\n' : '';
	const sproto_export_namespace = !NullStr(gCfg.defOptions.rootNamespace) || gCfg.defOptions.nodejsMode ? 'export ' : '';

	const sproto_file_content = String.format(sproto_def_fmt,
		sproto_import_content,
		sproto_reference_content,
		sproto_namespace_head,
		sproto_IMsgMap,
		sproto_SCHandlerMap,
		sproto_HandlerMap,
		sproto_namespace_tail,
		sproto_export_namespace
	);
	return sproto_file_content;
}

// main entry
generate(rootDir);
