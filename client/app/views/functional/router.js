const router={
  url:'/functional',
  redirect:'/functional/curry',
  name:'functional',
  icon:'icon-life-bouy',
  children:[
    {
      url:'/curry',
      name:'curry',
      icon:'icon-th-list',
      component:()=>import('./curry'),
    },
  ],
};
export default router;