import avatar from '@common/images/usr.jpg';
const navDrop=[
  {
    name:'Profile',
    icon:'id-card',
    url:'',
  },
  {
    name:'Sign Out',
    icon:'sign-in',
    url:'',
  },
];
export const users=[
  {
    id:'0',
    name:'huy',
    age:18,
    role:5,
    email:'ah.yiru@gmail.com',
    addr:'wuhan',
    avatar:avatar,
    nav:navDrop,
  },
  {
    id:'1',
    name:'test1',
    age:22,
    role:3,
    email:'test1@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
  {
    id:'2',
    name:'test2',
    age:22,
    role:3,
    email:'test2@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
  {
    id:'3',
    name:'test3',
    age:22,
    role:3,
    email:'test3@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
  {
    id:'4',
    name:'test4',
    age:22,
    role:3,
    email:'test4@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
  {
    id:'5',
    name:'test5',
    age:22,
    role:3,
    email:'test5@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
  {
    id:'6',
    name:'test6',
    age:22,
    role:3,
    email:'test6@test.com',
    addr:'zhuhai',
    avatar:avatar,
  },
];

const book=type=>{
  let books=[];
  for(let i=0;i<10;i++){
    books.push({
      name:`book${i+1}-${type}`,
      auth:`auth${i+1}-${type}`,
      type:`type${i+1}-${type}`,
    });
  }
  return books;
};

const sport=type=>{
  let sports=[];
  for(let i=0;i<5;i++){
    sports.push({
      name:`ball${i+1}-${type}`,
      auth:`auth${i+1}-${type}`,
      type:`type${i+1}-${type}`,
    });
  }
  return sports;
};

const slist={
  book,
  sport,
};

export const srcList=type=>slist[type]&&slist[type](type);

export const src=id=>[
  {
    name:`book-${id}`,
    type:'book',
    num:10,
    price:122,
  },
  {
    name:`sport-${id}`,
    type:'sport',
    num:5,
    price:222,
  },
  {
    name:`book1-${id}`,
    type:'book',
    num:4,
    price:33,
  },
  {
    name:`sport1-${id}`,
    type:'sport',
    num:15,
    price:21,
  },
];

