import React from 'react';

const {useState,useEffect}=React;

import {Link} from '@app/configs';

import './index.less';

const Menu=props=>{
  const [menu,setMenu]=useState(props.menu);
  useEffect(()=>{
    setMenu(props.menu);
  },[props]);
  const toggle=(e,v)=>{
    e.stopPropagation();
    v.open=!v.open;
    setMenu([...menu]);
  };

  const render=menu=>{
    return menu.map(v=>{
      const hasChildren=v.children&&v.children.length;
      const active=v.active?'active':'';
      if(hasChildren){
        return <li key={v.name} onClick={e=>toggle(e,v)}>
          <Link path={v.url} className={active} preventDefault>
            {v.icon&&<i className={v.icon} />}
            <span className="has-right-icon">{v.name}</span>
            <i className={`ivu-angle ${v.open?'top':'bottom'}`} />
          </Link>
          <ul className={v.open?'fade-in':''}>{render(v.children)}</ul>
        </li>;
      }
      return <li key={v.name}>
        <Link path={v.url} stopPropagation className={active}>
          {v.icon&&<i className={v.icon} />}
          <span>{v.name}</span>
        </Link>
      </li>;
    });
  };
  return <div className="menu">
    <ul className="tree-root">
      {render(menu)}
    </ul>
  </div>;
};

export default Menu;





















