let exec = require('child_process').exec;

let last;

function check() {
    last = exec('lsof -i:8091');
    last.on('exit', function (code) {
        console.log(code)
        if (code != "0") {
            console.log('restarting');
            console.log('主服务已经关闭，正在重启');
            run();
        }else{
            console.log('running')
            console.log('主服务正在运行中...');
        }
    })
    setTimeout(check,5000)
}

function run() {
    last = exec('npm run restart');
    last.on('exit',function(code){
        if (code == "0") {
            console.log('主服务已重启成功');
        }else{
            console.log('主服务重启失败');
        }
    })
}

check()
