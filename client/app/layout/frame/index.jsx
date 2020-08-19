import React from 'react';

const {useState,useMemo}=React;

import './index.less';

import Header from '../header';

import Footer from '../footer';

import Main from '../main';

const renderCurrentMenu=menu=>menu.find(v=>v.open)?.children??[];

const horizonMenu=menu=>menu.filter(v=>v.name).map(v=>{
  const {children,...firstLevel}=v;
  return firstLevel;
});

const Frame=props=>{

  const {menu,theme,updateRouter}=props;

  const [showMenu,setShowMenu]=useState(false);

  const collapseMenu=show=>show===false?setShowMenu(show):setShowMenu(state=>!state);

  const showMenuCls=showMenu?' showMenu':'';

  const header=useMemo(()=><Header updateRouter={updateRouter} theme={theme} menu={horizonMenu(menu)} user={props.user?.data} collapseMenu={collapseMenu} />,[menu,theme,props.user]);

  return <div className={`frame ${theme||'dark'}`}>
    <header className="frame-header">
      {header}
    </header>
    <main className="frame-main">
      <Main showMenu={showMenuCls} data={{...props,menu:renderCurrentMenu(menu)}} />
    </main>
    <footer className={`frame-footer${showMenuCls}`}>
      <Footer />
    </footer>
  </div>;
};


export default Frame;



































