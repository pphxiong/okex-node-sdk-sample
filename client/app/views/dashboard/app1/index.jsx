import React from 'react';

import './index.less';

const Index=props=>{
  const changeHist=()=>{
    props.updateRouter(prev=>({...prev,browserRouter:!prev.browserRouter}));
  };
  const changeTheme=()=>{
    props.updateRouter(prev=>{
      const theme=prev.theme==='dark'?'light':'dark';
      return {...prev,theme:theme};
    });
  };
  const changeMenu=()=>{
    props.updateRouter(prev=>{
      const addMenu={
        url:'/addMenu',
        name:'addMenu',
        icon:'icon-plus',
        component:<h1>added menu</h1>,
      };
      let newMenu=[...prev.routers];
      newMenu[0].children[0].children=[...newMenu[0].children[0].children,addMenu];
      return {
        ...prev,
        routers:newMenu,
      };
    });
  };
  return <div className="page">
    {props.user?.data.name}
    <button className="" onClick={changeHist}>change boswerHistory</button>
    <button className="" onClick={changeTheme}>change theme</button>
    <button className="" onClick={changeMenu}>add menu</button>
  </div>;
};

export default Index;

















