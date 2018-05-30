import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra-promise';
import * as UglifyJS from 'uglify-js';
import * as os from 'os';
import * as chalk from 'chalk';
import { isString, isBoolean } from 'util';

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
        "-ct": [
                "Specifies the target format. Also accepts a path to require a custom target.",
                "        json           JSON representation",
                "        json-module    JSON representation as a module",
                "        proto2         Protocol Buffers, Version 2",
                "        proto3         Protocol Buffers, Version 3",
                "        static         Static code without reflection (non-functional on its own)",
                "        static-module Static code without reflection as a module"
            ],
        "-t": string,
        "--keep-case"?: boolean,		"-c02": "Keeps field casing instead of converting to camel case.",
        "--no-create"?: boolean,		"-c03": "Does not generate create functions used for reflection compatibility.",
        "--no-encode"?: boolean,		"-c04": "Does not generate encode functions.",
        "--no-decode"?: boolean,		"-c05": "Does not generate decode functions.",
        "--no-verify"?: boolean,		"-c06": "Does not generate verify functions.",
        "--no-convert"?: boolean,	"-c07": "Does not generate convert functions like from/toObject",
        "--no-delimited"?: boolean,	"-c08": "Does not generate delimited encode/decode functions.",
        "--no-beautify"?: boolean,	"-c09": "Does not beautify generated code.",
        "--no-comments"?: boolean,	"-c10": "Does not output any JSDoc comments."
    },
    "defOptions": {
        "-c01": [
            "use packageID and cmdID mode for network use",
            "       if use packageCmdMode, add //$<ID:number> after package line and message line",
            "       example:",
            "           package Test; //$1",
            "           message Msg //$1",
            "           {",
            "               ...",
            "           }"
            ],
        "packageCmdMode": boolean,
        "rootNamespace": string,        "-c02": "root namespace for export file",
        "nodejsMode": boolean,          "-c03": "nodejs mode for `export`",
		"importPath"?: string,          "-c04": "import protobuf file(for nodejs)",
		"referencePath"?: string,       "-c05": "/// <reference path=\"<You Path Here>\" />",
		"outTSFile": string
    },
	"sourceRoot": string,
	"outputFile": string,
	"outputTSFile": string,
}


const config_file_path = './build_config.json'
const fmt_file_list = {
	true: "./fmt/packageCmdType.fmt",
	false: "./fmt/NormalType.fmt",
};

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
	let fmt_file_path: string = fmt_file_list[`${gCfg.defOptions.packageCmdMode}`];
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

	if (gCfg.defOptions.packageCmdMode) {
			await Promise.all(protoList.map(async (protofile) => {
				const content = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8')
				if (content.indexOf('package') == -1) {
					exception(`${protofile} must have "package XXX;" declare!`);
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
	pbjsResult = 'var $protobuf = window.protobuf;\n$protobuf.roots.default=window;\n' + pbjsResult;
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
	pbtsResult = pbtsResult.replace(/\$protobuf/gi, 'protobuf').replace(/export namespace/gi, 'declare namespace');
	pbtsResult = 'type Long = protobuf.Long;\n' + pbtsResult;
	let tsOutFile = gCfg.outputTSFile ? path.join(_rootDir, gCfg.outputTSFile) : jsOutFile.substr(0, jsOutFile.lastIndexOf('.js')) + '.d.ts';
	logger(`gen ts file :${green(tsOutFile)}`);
	logger(`file size   :${yellow(format_size(pbtsResult.length))}`);
	await fs.mkdirpAsync(path.dirname(tsOutFile));
	await fs.writeFileAsync(tsOutFile, pbtsResult, 'utf-8');
	await fs.removeAsync(tempfile);
	// gen encode decode and type check code & save file
	if (!NullStr(gCfg.defOptions.outTSFile))
	{
		const sproto_file_content = gCfg.defOptions.packageCmdMode
							? await gen_packageCmdMode_content(protoRoot, protoList)
							: await gen_NormalMode_content(protoRoot, protoList);
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
		message_list : {
			[message_id: number]: { message_name: string, imessage_name: string }
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
		// find package first
		while (lines.length > 0) {
			let line = lines.shift().trim();
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
			break;
		}

		// find message
		while (lines.length > 0) {
			let line = lines.shift().trim();
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
		}
	}

	// logger(yellow(JSON.stringify(package_def)));
	return package_def;
}

type NormalModeDef = {
	[package_name: string]: {
		message_list : string[]
	},
	'__None_NameSpace__': {message_list: string[]
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
		for (; index < lines.length; ++index) {
			let line = lines[index].trim();
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
			break;
		}

		if (!found_package) {
			index = 0;
		}

		// find message
		for (; index < lines.length; ++index) {
			let line = lines[index].trim();
			// not message line
			if (line.substr(0, message_line.length) != message_line) {
				continue;
			}
			line = line.substr(message_line.length).trim();
			const message_name = line.substr(0, FindWords(line)).trim();
			package_def[package_name].message_list.push(message_name);
		}
	}
	return package_def;
}

async function gen_NormalMode_content(protoRoot: string, protoFileList: string[]): Promise<string> {
	let package_def = await generate_NormalMode_tables(protoRoot, protoFileList);
	let sproto_INotifyType = '';
	let sproto_NotifyType = '';

	for (let pname in package_def) {
		for (let cname of package_def[pname].message_list) {
			if (pname != '__None_NameSpace__') {
				sproto_INotifyType += `\t\t'${pname}_${cname}': ${pname}.I${cname},\n`;
				sproto_NotifyType += `\t\t${pname}_${cname}: '${pname}_${cname}',\n`;
			} else {
				sproto_INotifyType += `\t\t'${cname}': I${cname},\n`;
				sproto_NotifyType += `\t\t${cname}: '${cname}',\n`;
			}
		}
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? "export " : "";
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
	? `import * as protobuf from '${gCfg.defOptions.importPath}';\n`
	: "";
	const sproto_reference_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.referencePath)
	? `/// <reference path="${gCfg.defOptions.referencePath}" />\n`
	: "";
	const sproto_namespace_head = !NullStr(gCfg.defOptions.rootNamespace)
	? `${sproto_export}namespace ${gCfg.defOptions.rootNamespace} {\n`
	: "";
	const sproto_namespace_tail = !NullStr(gCfg.defOptions.rootNamespace) ? "}\n" : "";
	const sproto_export_namespace = !NullStr(gCfg.defOptions.rootNamespace) ? "export " : "";

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
	const fmt_package = function(sysid: string):string { return `\t\t'${sysid}': {\n`; }
	const fmt_type_package = function(sysid: string):string { return `\t\t${sysid}: {\n`; }
	const fmt_message = function(cmdid: string, package_name: string): string { return `\t\t\t'${cmdid}': ${package_name},\n`; }
	const fmt_type_message = function(sysid: string, cmdid: string, package_name: string, msgname: string): string {
		return `\t\t\t${msgname}: <IHandler<'${sysid}', '${cmdid}'>>{s: '${sysid}', c: '${cmdid}', ns: ${sysid}, nc: ${cmdid}, pt: ${package_name}.${msgname} },\n`;
	}


	for (let package_id in package_def) {
		sproto_IMsgMap += fmt_package(package_id);
		sproto_SCHandlerMap += fmt_package(package_id);
		sproto_HandlerMap += fmt_type_package(package_def[package_id].package_name);
		const p_def = package_def[package_id];
		for (let cmd_id in p_def.message_list) {
			sproto_IMsgMap += fmt_message(cmd_id, `${p_def.package_name}.${p_def.message_list[cmd_id].imessage_name}`);
			sproto_SCHandlerMap += fmt_message(cmd_id, `${p_def.package_name}.${p_def.message_list[cmd_id].message_name}`);
			sproto_HandlerMap += fmt_type_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name);
		}
		sproto_IMsgMap += '\t\t},\n';
		sproto_SCHandlerMap += '\t\t},\n';
		sproto_HandlerMap += '\t\t},\n';
	}

	const sproto_export = gCfg.defOptions.nodejsMode ? "export " : "";
	const sproto_import_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.importPath)
						? `import * as protobuf from '${gCfg.defOptions.importPath}';\n`
						: "";
	const sproto_reference_content = gCfg.defOptions.nodejsMode && !NullStr(gCfg.defOptions.referencePath)
						? `/// <reference path="${gCfg.defOptions.referencePath}" />\n`
						: "";
	const sproto_namespace_head = !NullStr(gCfg.defOptions.rootNamespace)
						? `${sproto_export}namespace ${gCfg.defOptions.rootNamespace} {\n`
						: "";
	const sproto_namespace_tail = !NullStr(gCfg.defOptions.rootNamespace) ? "}\n" : "";
	const sproto_export_namespace = !NullStr(gCfg.defOptions.rootNamespace) || gCfg.defOptions.nodejsMode ? "export " : "";

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
