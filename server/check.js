let exec = require('child_process').exec;

let last;
function check() {
    // last = exec('lsof -i:8091');
    // last.on('exit', function (code) {
    //     console.log(code)
    //     if (code == "0") {
    //         console.log('restarting');
    //         // console.log('主服务已经关闭，正在重启');
    //         restart();
    //     }else{
    //         console.log('running')
    //         // console.log('主服务正在运行中...');
    //     }
    // })
    process.on('uncaughtException', function (err) {
        //打印出错误
        console.log('uncaughtException',err);
        restart()
    });
    process.on('exit', function (err) {
        console.log('exit',err);
        restart()
    });
    // setTimeout(check,5000)
}

function restart() {
    console.log('restarting......')
    last = exec('npm run restart:all', function(err, stdout , stderr ){
        if (err) {
            console.log('restarting failed')
        }else{
            console.log('restarting success')
        }
    });
}

check()
