import sleep from '@common/utils/sleep';
export const fetchUser=async ()=>{
  await sleep();
  return {
    code:200,
    msg:'success',
    data:{
      name:'huy',
      age:18,
      role:5,
      email:'ah.yiru@gmail.com',
      addr:'wuhan',
    },
  };
};