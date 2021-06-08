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
        // console.log(err);
        restart()
    });
    setTimeout(check,5000)
}

function restart() {
    last = exec('npm run restart', function(err, stdout , stderr ){
        console.log(err,stdout,stderr)
    });
    last.on('exit',function(code){
        if (code == "0") {
            console.log('restarting success')
            // console.log('主服务已重启成功');
        }else{
            console.log('restarting failed')
            // console.log('主服务重启失败');
        }
    })
}

check()
