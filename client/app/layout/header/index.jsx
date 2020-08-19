import React from 'react';
import {Link} from '@huxy/router';

import useViewSize from '@common/use/useViewSize';

import './index.less';

import configs from '../../configs';

const {useState,useEffect}=React;

const themeList=[
  {
    name:'深暗色',
    key:'dark',
  },
  {
    name:'浅亮色',
    key:'light',
  },
  {
    name:'深暗色1',
    key:'dark1',
  },
  {
    name:'浅亮色1',
    key:'light1',
  },
];

const Header=props=>{
  const {collapseMenu,menu,user,theme,updateRouter}=props;
  const [showNav,setShowNav]=useState(false);
  const [showTheme,setShowTheme]=useState(false);
  const [showMenu,setShowMenu]=useState(false);
  const [selected,setSelected]=useState(theme);
  useEffect(()=>{
    const navListeners=()=>{
      setShowNav(false);
      const w=window.innerWidth;
      if(w<1024){
        collapseMenu(false);
        setShowMenu(false);
      }
    };
    const themeListeners=()=>{
      setShowTheme(false);
    };
    window.addEventListener('click',navListeners,false);
    window.addEventListener('click',themeListeners,false);
    return ()=>{
      window.removeEventListener('click',navListeners,false);
      window.removeEventListener('click',themeListeners,false);
    };
  },[]);
  const toggleMenu=e=>{
    e.stopPropagation();
    setShowMenu(!showMenu);
    collapseMenu();
  };
  const toggleNav=e=>{
    e.stopPropagation();
    setShowNav(!showNav);
  };
  const handleNav=item=>{
    console.log(item);
  };
  const switchTheme=e=>{
    e.stopPropagation();
    setShowTheme(!showTheme);
  };
  const selectedTheme=item=>{
    setSelected(item.key);
    updateRouter({theme:item.key});
  };

  return <div className="header">
    {/* <div className="collapseMenu" style={{display:'block'}} onClick={e=>toggleMenu(e)}><i className="icon-navicon" /></div> */}
    <div className="banner">
      <div className="logo"><img src={user?.avatar} alt="logo" /></div>
      <div className="title">{configs.title}</div>
    </div>
    <div className="nav">
      <ul className="nav-left">
        <li className="collapseMenu" onClick={e=>toggleMenu(e)}>
          <a>
            {/* <i className="icon-navicon" /> */}
            <span className="anion">
              <span className={`hline${showMenu?' right':''}`} />
            </span>
          </a>
        </li>
        <li>
          <a onClick={e=>switchTheme(e)}>主题</a>
          <ul className={`lt ${showTheme?'show':''}`}>
            {
              themeList.map(v=><li key={v.key}>
                <a className={selected===v.key?'active':''} onClick={()=>selectedTheme(v)}>
                  <span>{v.name}</span>
                </a>
              </li>)
            }
          </ul>
        </li>
        {
          menu.map(v=><li key={v.url}><Link path={v.url} className={v.active?'active':''}>{v.name}</Link></li>)
        }
      </ul>
      <ul className="nav-right">
        <li>
          <a onClick={e=>toggleNav(e)}>
            <div className="avatar">
              <img className="usr" src={user?.avatar} alt="user" />
              <span>{user?.name}</span>
              <i className={`ivu-angle ${showNav?'top':'bottom'}`}/>
            </div>
          </a>
          <ul className={`rt ${showNav?'show':''}`}>
            {
              user?.nav&&user.nav.map(v=><li key={v.name}>
                <a onClick={()=>handleNav(v)}>
                  <i className={`icon-${v.icon}`}/>
                  <span>{v.name}</span>
                </a>
              </li>)
            }
          </ul>
        </li>
      </ul>
    </div>
  </div>;
};

export default Header;



































