// import useRouter,{Link} from '@huxy/router';
import useRouter,{Link} from '@router';

export {useRouter,Link};

const browserRouter=!process.env.isDev;
const idKey='url';
const title='项目管理平台';
const theme='dark';
let whiteList=['/dashboard/app4'/* ,'/use/style' */];
whiteList=browserRouter?whiteList:whiteList.map(v=>`#${v}`);
const beforeRender=input=>{
  if(whiteList.includes(input.path)){
    return {path:'#/pages/400/401'};
  }
};
const afterRender=output=>{
  console.log(output);
};

export default {
  browserRouter,
  idKey,
  title,
  theme,
  beforeRender,
  // afterRender,
};

// console.log(process.env);











































