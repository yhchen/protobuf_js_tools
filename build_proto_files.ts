import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra-promise';
import * as UglifyJS from 'uglify-js';
import * as os from 'os';
import * as chalk from 'chalk';
import { isString, isBoolean } from 'util';

const green = chalk.default.greenBright;
const yellow = chalk.default.yellowBright.underline;
const whiteBright = chalk.default.whiteBright;
const logger = console.log;

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
	options: {
		'-t': string,//					Specifies the target format. Also accepts a path to require a custom target.
		//									json			JSON representation
		//									json-module	JSON representation as a module
		//									proto2		Protocol Buffers, Version 2
		//									proto3		Protocol Buffers, Version 3
		//									static		Static code without reflection (non-functional on its own)
		//									static-module Static code without reflection as a module
		'--keep-case'?: boolean,//		Keeps field casing instead of converting to camel case.
		'--no-create'?: boolean,//		Does not generate create functions used for reflection compatibility.
		'--no-encode'?: boolean,//		Does not generate encode functions.
		'--no-decode'?: boolean,//		Does not generate decode functions.
		'--no-verify'?: boolean,//		Does not generate verify functions.
		'--no-convert'?: boolean,//		Does not generate convert functions like from/toObject
		'--no-delimited'?: boolean,//	Does not generate delimited encode/decode functions.
		'--no-beautify'?: boolean,//	Does not beautify generated code.
		'--no-comments'?: boolean,//	Does not output any JSDoc comments.
	},
	importProtoBuffPath?: string,//	 import protobuf file(for nodejs)
	sourceRoot: string,
	outputFile: string,
	outputTSFile?: string,
	outputTSCodeFile?: string,
}

const config_file_path = './build_config.json'
if (!fs.existsSync(config_file_path)) {
	throw `build config file ${config_file_path} not found`;
}
const config_content = fs.readFileSync(config_file_path, 'utf-8');
const g_pbConfig: ProtobufConfig = JSON.parse(config_content);

logger(`config      :${green(JSON.stringify(g_pbConfig))}`);

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
	const jsOutFile = path.join(_rootDir, g_pbConfig.outputFile);
	const dirname = path.dirname(jsOutFile);
	await fs.mkdirpAsync(dirname);
	const protoRoot = path.join(_rootDir, g_pbConfig.sourceRoot);
	logger(`proto dir   :${green(protoRoot)}`);
	const sproto_import_content = g_pbConfig.importProtoBuffPath ? `import * as protobuf from '${g_pbConfig.importProtoBuffPath}';\n` : "";
	// find *.proto files
	const fileList = await fs.readdirAsync(protoRoot);
	const protoList = fileList.filter(item => path.extname(item) === '.proto')
	if (protoList.length == 0) {
		throw `${protoRoot} *.proto not found!`;
	}
	logger(`found .proto:${green(fileList.toString())}`);
	await Promise.all(protoList.map(async (protofile) => {
		const content = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8')
		if (content.indexOf('package') == -1) {
			throw `${protofile} must have "package XXX;" declare!`;
		}
	}));

	const args = ['-p', protoRoot, protoList.join(' '), '-o', tempfile];
	for (let _key in g_pbConfig.options) {
		if (isBoolean(g_pbConfig.options[_key])) {
			if (g_pbConfig.options[_key]) {
				args.unshift(_key);
			}
		} else if (isString(g_pbConfig.options[_key])) {
			args.unshift(g_pbConfig.options[_key]);
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
	let tsOutFile = g_pbConfig.outputTSFile ? path.join(_rootDir, g_pbConfig.outputTSFile) : jsOutFile.substr(0, jsOutFile.lastIndexOf('.js')) + '.d.ts';
	logger(`gen ts file :${green(tsOutFile)}`);
	logger(`file size   :${yellow(format_size(pbtsResult.length))}`);
	await fs.mkdirpAsync(path.dirname(tsOutFile));
	await fs.writeFileAsync(tsOutFile, pbtsResult, 'utf-8');
	await fs.removeAsync(tempfile);
	// gen encode decode and type check code & save file
	if (g_pbConfig.outputTSCodeFile)
	{
		let package_def: PackageDef = await generate_tables(protoRoot, fileList);
		const fmt_package = function(sysid: string):string { return `\t\t'${sysid}': {\n`; }
		const fmt_type_package = function(sysid: string):string { return `\t\t${sysid}: {\n`; }
		const fmt_message = function(cmdid: string, package_name: string): string { return `\t\t\t'${cmdid}': ${package_name},\n`; }
		const fmt_type_message = function(sysid: string, cmdid: string, package_name: string, msgname: string): string {
			return `\t\t\t${msgname}: <IHandler<'${sysid}', '${cmdid}'>>{s: '${sysid}', c: '${cmdid}', ns: ${sysid}, nc: ${cmdid}, pt: ${package_name}.${msgname} },\n`;
		}

		let sproto_map = '\t//Proto Msg Check\n\texport type IMsgMap = {\n';
		let sproto_handler_map = '\t//Proto Msg Handler\n\tconst _SCHandlerMap = {\n';
		let sproto_type_handler_map =
		'\texport interface IHandler<T extends keyof IMsgMap, T1 extends keyof IMsgMap[T]> {\n' +
		'\t\treadonly s: T;//		sysid(string)\n' +
		'\t\treadonly c: T1;//		cmdid(string)\n' +
		'\t\treadonly ns: number,//	sysid(number)\n' +
		'\t\treadonly nc: number,//	cmdid(number)\n' +
		'\t\treadonly pt: any,//		protobuf-static class pointer\n' +
		'\t};\n' +
		'\tconst _HandlerMap = {\n';

		for (let package_id in package_def) {
			sproto_map += fmt_package(package_id);
			sproto_handler_map += fmt_package(package_id);
			sproto_type_handler_map += fmt_type_package(package_def[package_id].package_name);
			const p_def = package_def[package_id];
			for (let cmd_id in p_def.message_list) {
				sproto_map += fmt_message(cmd_id, `${p_def.package_name}.${p_def.message_list[cmd_id].imessage_name}`);
				sproto_handler_map += fmt_message(cmd_id, `${p_def.package_name}.${p_def.message_list[cmd_id].message_name}`);
				sproto_type_handler_map += fmt_type_message(package_id, cmd_id, p_def.package_name, p_def.message_list[cmd_id].message_name);
			}
			sproto_map += '\t\t},\n';
			sproto_handler_map += '\t\t},\n';
			sproto_type_handler_map += '\t\t},\n';
		}
		sproto_map += '\t};\n\n';
		sproto_handler_map += '\t};\n	export const SCHandlerMap = _SCHandlerMap as _DeepReadonly<typeof _SCHandlerMap>;\n\n';
		sproto_type_handler_map += '\t};\n	export const HandlerMap = _HandlerMap as _DeepReadonly<typeof _HandlerMap>;\n\n'
		const sproto_funtional_body = "\
	export function EncodeH<T extends keyof IMsgMap, T1 extends keyof IMsgMap[T]>(_handler: IHandler<T, T1>, proto: IMsgMap[T][T1]) : Uint8Array|undefined {\n\
		try {\n\
			let buffer: protobuf.Writer = _handler.pt.encode(proto);\n\
			return buffer.finish();\n\
		} catch (ex) {\n\
			console.error(`Encode sysid:${_handler.s} cmdid:${_handler.c} failure. error:${ex}`);\n\
		}\n\
	}\n\
\n\
	export function DecodeH<T extends keyof IMsgMap, T1 extends keyof IMsgMap[T]>(_handler: IHandler<T, T1>, buffer: Uint8Array) : IMsgMap[T][T1] {\n\
		try {\n\
			return _handler.pt.decode(buffer);\n\
		} catch (ex) {\n\
			console.error(`Decode sysid:${_handler.s} cmdid:${_handler.c} failure. error:${ex}`);\n\
		}\n\
	}\n\
\n\
\n\
	export function EncodeSC<T extends keyof IMsgMap, T1 extends keyof IMsgMap[T]>(sysid: T, cmdid: T1, proto: IMsgMap[T][T1]) : Uint8Array|undefined {\n\
		const package_handler = SCHandlerMap[sysid];\n\
		if (package_handler == null) {\n\
			console.error(`Encode Proto failure. package type sysid:[${sysid}] cmdid:${cmdid}] not found.`);\n\
			return;\n\
		}\n\
		const cmd_handler = package_handler[<string>cmdid];\n\
		if (cmd_handler == null) {\n\
			console.error(`Encode Proto failure. proto type sysid:[${sysid}] cmdid:${cmdid}] not found.`);\n\
			return;\n\
		}\n\
		try {\n\
			let buffer: protobuf.Writer = cmd_handler.encode(proto);\n\
			return buffer.finish();\n\
		} catch (ex) {\n\
			console.error(`Encode sysid:${sysid} cmdid:${cmdid} failure. error:${ex}`);\n\
		}\n\
	}\n\
\n\
	export function DecodeSC<T extends keyof IMsgMap, T1 extends keyof IMsgMap[T]>(sysid: T, cmdid: T1, buffer: Uint8Array) : IMsgMap[T][T1] {\n\
		const package_handler = SCHandlerMap[sysid];\n\
		if (package_handler == null) {\n\
			console.error(`Decode Proto failure. package type sysid:[${sysid}] cmdid:${cmdid}] not found.`);\n\
			return;\n\
		}\n\
		const cmd_handler = package_handler[<string>cmdid];\n\
		if (cmd_handler == null) {\n\
			console.error(`Decode Proto failure. proto type sysid:[${sysid}] cmdid:${cmdid}] not found.`);\n\
			return;\n\
		}\n\
		try {\n\
			return cmd_handler.decode(buffer);\n\
		} catch (ex) {\n\
			console.error(`Decode sysid:${sysid} cmdid:${cmdid} failure. error:${ex}`);\n\
		}\n\
	}\n";
		const sproto_namespace_header = "\
	/**\n\
	 * 递归将 “T” 中及其子对象所有属性设置为只读\n\
	 * Make all properties recursive in T readonly\n\
	 */\n\
	type _DeepReadonly<T> = {\n\
		readonly [P in keyof T]: _DeepReadonly<T[P]>;\n\
	};\n\n";

		const sproto_file_content = sproto_import_content + `namespace ProtoDef\n{\n` + sproto_namespace_header + sproto_map + sproto_handler_map + sproto_type_handler_map + sproto_funtional_body + "}\n";
		const tsCodeFilePath = path.join(_rootDir, g_pbConfig.outputTSCodeFile);
		await fs.mkdirpAsync(path.dirname(tsCodeFilePath));
		await fs.writeFileAsync(tsCodeFilePath, sproto_file_content, {encoding:'utf-8', flag:'w+'});
		logger(`gen ts file :${green(tsCodeFilePath)}`);
		logger(`file size   :${yellow(format_size(sproto_file_content.length))}`);
	}

	logger(whiteBright(`***********************************************`));
	logger(whiteBright(`*               done with all                 *`));
	logger(whiteBright(`***********************************************`));
}

type PackageDef = {
	[package_id: number]: {
		package_name: string,
		message_list : {
			[message_id: number]: { message_name: string, imessage_name: string }
		}
	}
};

async function generate_tables(protoRoot: string, protoFileList: string[]) {
	let package_def: PackageDef = { };
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
				throw `proto file ${protofile} package id not found`;
			}
			line = line.substr(package_line.length).trim();
			const package_name = line.substr(0, line.indexOf(';'));
			const spackage_id = line.substr(line.indexOf(mask_flag) + mask_flag.length).trim();
			package_id = parseInt(spackage_id);
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
				throw `proto file ${protofile} message id not found line:\n${line}`;
			}
			line = line.substr(message_line.length).trim();
			const message_name = line.substr(0, line.indexOf(mask_flag)).trim();
			const imessage_name = 'I' + message_name;
			const smessage_id = line.substr(line.indexOf(mask_flag) + mask_flag.length).trim();
			const message_id = parseInt(smessage_id);
			package_def[package_id].message_list[message_id] = {message_name, imessage_name};
		}
	}

	// logger(yellow(JSON.stringify(package_def)));
	return package_def;
}

// main entry
generate(rootDir);
