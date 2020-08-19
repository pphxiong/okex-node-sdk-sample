import React,{Suspense,useState,useEffect,useRef} from 'react';

import {data} from './config';

// import {Link} from '@huxy/router';
import {Link} from '@app/configs';

import Spinner from '@app/components/spinner';

import './index.less';

const columns=[
  {
    key:'name',
    text:'名称',
  },
  {
    key:'num',
    text:'数量',
  },
  {
    key:'price',
    text:'邮箱',
  },
  {
    key:'type',
    text:'类型',
  },
  {
    key:'list',
    text:'查看',
  },
];

const Index=props=>{
  console.log(11,props);
  const src=props.src?.data||[];
  return <div className="page">
    <div>
      {
        src?.length?
          <table className="ytable">
            <thead>
              <tr>
                {
                  columns.map(v=><th key={v.key}>{v.text}</th>)
                }
              </tr>
            </thead>
            <tbody>
              {
                src.map(v=><tr key={v.name}>
                  {columns.map(sv=><td key={`${v.name}-${sv.key}`}>{v[sv.key]||<Link path={`${props.inputPath}/${v.type}`}>{sv.text}</Link>}</td>)}
                </tr>)
              }
            </tbody>
          </table>:
          <Spinner />
      }
    </div>
  </div>;
};

export default Index;

















