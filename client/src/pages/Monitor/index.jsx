import React, { useState, useEffect } from 'react';
import { getWallet } from './api';

export default props => {
  const initData = async () => {
    const result = await getWallet();
    console.log(result)
  }

  useEffect(()=>{
    initData();
  })
  return <>monitor</>
}
