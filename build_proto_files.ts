import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra-promise';
import * as UglifyJS from 'uglify-js';
import * as os from 'os';
import * as chalk from 'chalk';

const green = chalk.default.greenBright;
const yellow = chalk.default.yellowBright.underline;
const logger = console.log;

logger(`__dirname   :${green(__dirname)}`);
const rootDir = path.resolve(__dirname, '../../');
logger(`root dir    :${green(rootDir)}`);

// 执行指令
function shell(command: string, args: string[]) {
    return new Promise<string>((resolve, reject) => {
        const cmd = command + ' ' + args.join(' ');
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(stdout)
            }
        })
    })
}


type ProtobufConfig = {
    options: {
        'no-create': boolean,
        'no-verify': boolean,
        'no-convert': boolean
    },
    sourceRoot: string,
    outputFile: string,
    outputTSFile?: string,
}

const g_pbConfig: ProtobufConfig = {
    options: {
        'no-create': false,
        'no-verify': false,
        'no-convert': true
    },
    sourceRoot: '/proto',
    outputFile: '../client/proto/protobuf-static.js',
    outputTSFile: '../client/proto/protobuf-static.d.ts',
};

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
    const tempfile = path.join(os.tmpdir(), 'build_proto', 'tmp_' + Date.now() + '.js');
    await fs.mkdirpAsync(path.dirname(tempfile));
    const jsOutFile = path.join(_rootDir, g_pbConfig.outputFile);
    const dirname = path.dirname(jsOutFile);
    await fs.mkdirpAsync(dirname);
    const protoRoot = path.join(_rootDir, g_pbConfig.sourceRoot);
    logger(`proto dir   :${green(protoRoot)}`);
    const fileList = await fs.readdirAsync(protoRoot);
    const protoList = fileList.filter(item => path.extname(item) === '.proto')
    if (protoList.length == 0) {
        throw `${protoRoot} 文件夹中不存在 .proto 文件`
    }
    logger(`found .proto:${green(fileList.toString())}`);
    await Promise.all(protoList.map(async (protofile) => {
        const content = await fs.readFileAsync(path.join(protoRoot, protofile), 'utf-8')
        if (content.indexOf('package') == -1) {
            throw `${protofile} 中必须包含 package 字段`
        }
    }));

    const args = ['-t', 'static', '-p', protoRoot, protoList.join(' '), '-o', tempfile]
    if (g_pbConfig.options['no-create']) {
        args.unshift('--no-create');
    }
    if (g_pbConfig.options['no-verify']) {
        args.unshift('--no-verify');
    }
    await shell('pbjs', args);
    let pbjsResult = await fs.readFileAsync(tempfile, 'utf-8');
    pbjsResult = 'var $protobuf = window.protobuf;\n$protobuf.roots.default=window;\n' + pbjsResult;
    logger(`gen js file :${green(jsOutFile)}`);
    logger(`file size   :${yellow(format_size(pbjsResult.length))}`)
    await fs.writeFileAsync(jsOutFile, pbjsResult, 'utf-8');
    const minjs = UglifyJS.minify(pbjsResult);
    let jsMinOutFile = jsOutFile.replace('.js', '.min.js');
    logger(`gen min.js  : ${green(jsMinOutFile)}`);
    logger(`file size   :${yellow(format_size(minjs.code.length))}`);
    await fs.writeFileAsync(jsMinOutFile, minjs.code, 'utf-8');
    await shell('pbts', ['--main', jsOutFile, '-o', tempfile]);
    let pbtsResult = await fs.readFileAsync(tempfile, 'utf-8');
    pbtsResult = pbtsResult.replace(/\$protobuf/gi, 'protobuf').replace(/export namespace/gi, 'declare namespace');
    pbtsResult = 'type Long = protobuf.Long;\n' + pbtsResult;
    let tsOutFile = g_pbConfig.outputTSFile == null ? g_pbConfig.outputTSFile : jsOutFile.replace('.js', '.d.ts');
    logger(`gen ts file :${green(tsOutFile)}`);
    logger(`file size   :${yellow(format_size(pbtsResult.length))}`);
    await fs.writeFileAsync(tsOutFile, pbtsResult, 'utf-8');
    await fs.removeAsync(tempfile);

    logger(`===============================================`);
    logger(`=              ${green('done with all')}                  =`);
    logger(`===============================================`);
}

function generate_tables(outfile: string, protoFileList: string[]): void {

}

// main entry
generate(rootDir);
