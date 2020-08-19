import React from 'react';
import './index.less';

const Spinner=({global})=>{
  const className=global?'spinner global':'spinner';
  return <div className={className}>
    <figure className="spinning" />
  </div>;
};

export default Spinner;







