import React,{ useState, useEffect } from 'react';
import { Button, InputNumber, Card, message, Divider, Popconfirm } from 'antd';
import { postLeverage, postSwapLeverage, postSwapOrder, getSwapAccount } from './api'

export default props => {
  const [leverage, setLeverage] = useState(10);
  const [swapLeverage, setSwapLeverage] = useState(5);

  // 定时获取账户信息
  const getAccountInterval = () => {
      setTimeout(async ()=>{
        const result = await getSwapAccount({ instrument_id: 'BTC-USD-SWAP' });
        console.log(result);
      },5000)
  }

  useEffect(()=>{
    getAccountInterval();
  },[])

  const onSetLeverage = async () => {
    const result = await postLeverage({ underlying: 'BTC-USDT', leverage, instrument_id: 'BTC-USDT-200821', direction: 'long' })
    const data = result?.data;
    if(data) message.success('设置成功')
  }

  const onSetSwapLeverage = async () => {
    const result = await postSwapLeverage({ instrument_id: 'BTC-USD-SWAP', leverage: swapLeverage, side: 3 })
    const data = result?.data;
    if(data) message.success('设置成功')
  }

  const openOrder = async () => {
    // btc 多仓
    const payload = {
      size: 1,
      type: 1,
      order_type: 4, //市价委托
      instrument_id: 'BTC-USD-SWAP'
    }
    const result = await postSwapOrder(payload);
    console.log(result)
    // eos 空仓
    const eosPayload = {
      size: 17,
      type: 2,
      order_type: 4, //市价委托
      instrument_id: 'BTC-EOS-SWAP'
    }
    const eosResult = await postSwapOrder(eosPayload);
    console.log(eosResult)
  }

  const closeOrder = async () => {
    // btc 平多
    const payload = {
      size: 1,
      type: 3,
      order_type: 4, //市价委托
      instrument_id: 'BTC-USD-SWAP'
    }
    const result = await postSwapOrder(payload);
    console.log(result)
    // eos 平空
    const eosPayload = {
      size: 17,
      type: 4,
      order_type: 4, //市价委托
      instrument_id: 'BTC-EOS-SWAP'
    }
    const eosResult = await postSwapOrder(eosPayload);
    console.log(eosResult)
  }

  return <>
    <Card title={'交割合约'}>
      <span>设置杠杆倍数：</span><InputNumber value={leverage} step={1} onChange={v=>setLeverage(v)}/>
      <Button onClick={()=>onSetLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>
    </Card>
    <Card title={'永续合约'} style={{ marginTop: 10 }}>
      <span>设置杠杆倍数：</span><InputNumber value={swapLeverage} step={1} onChange={v=>setSwapLeverage(v)}/>
      <Button onClick={()=>onSetSwapLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>

      <Divider type="horizontal" />

      <Popconfirm
        title="是否确定以市价开仓？"
        onConfirm={()=>openOrder()}
        >
        <Button>对冲开仓</Button>
      </Popconfirm>

      <Popconfirm
        title="是否确定要全部平仓？"
        onConfirm={()=>closeOrder()}
      >
        <Button type="primary" style={{ marginLeft: 10 }}>全平</Button>
      </Popconfirm>

    </Card>
  </>
}
