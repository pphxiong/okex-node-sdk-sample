import React,{ useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Card, message, Divider, Popconfirm, Row, Col } from 'antd';
import {
  postFuturesLeverage,
  postSwapLeverage,
  postFuturesOrder,
  getSwapAccount,
  getFuturesPosition,
  getFuturesLeverage,
  startMonitor,
  stopMonitor
} from './api'
import moment from 'moment'

export default props => {
  const [leverage, setLeverage] = useState(10);
  const [swapLeverage, setSwapLeverage] = useState(5);
  const [size, setSize] = useState(1);
  const [btcPosition, setBtcPosition] = useState({});
  const [eosPosition, setEosPosition] = useState({})

  const getPosition = async () => {
    const result = await getFuturesPosition({instrument_id: 'BTC-USD-201225'});
    setBtcPosition(result?.data?.holding[0]);
    const eosResult = await getFuturesPosition({instrument_id: 'EOS-USD-201225'});
    setEosPosition(eosResult?.data?.holding[0]);
  }

  const getLeverage = async () => {
    const result = await getFuturesLeverage({ underlying: 'BTC-USD' });
    setLeverage(result?.data?.leverage);
  }

  useEffect(()=>{
    getPosition();
    getLeverage();
  },[])

  const onSetLeverage = async () => {
    // const result = await postFuturesLeverage({ underlying: 'BTC-USD', leverage, instrument_id: 'BTC-USD-201225', direction: 'long' })
    const result = await postFuturesLeverage({ underlying: 'BTC-USD', leverage });
    const data = result?.data;
    if(data) message.success('BTC杠杆设置成功');
    setTimeout(async ()=>{
      const eosResult = await postFuturesLeverage({ underlying: 'EOS-USD', leverage });
      const eosData = eosResult?.data;
      if(eosData) message.success('EOS杠杆设置成功');
    },1000);
  }
  //
  // const onSetSwapLeverage = async () => {
  //   const result = await postSwapLeverage({ instrument_id: 'BTC-USD-SWAP', leverage: swapLeverage, side: 3 })
  //   const data = result?.data;
  //   if(data) message.success('设置成功')
  // }

  const openOrder = async () => {
    // btc 多仓
    const payload = {
      size,
      type: 1,
      order_type: 4, //市价委托
      instrument_id: 'BTC-USD-201225'
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success('BTC开仓成功');
    // eos 空仓
    const eosPayload = {
      size: size * 10,
      type: 2,
      order_type: 4, //市价委托
      instrument_id: 'EOS-USD-201225'
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS开仓成功');
  }

  const closeOrder = async () => {
    // btc 平多
    const payload = {
      size,
      type: 3,
      order_type: 4, //市价委托
      instrument_id: 'BTC-USD-201225'
    }
    const result = await postFuturesOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success('BTC平仓成功');
    // eos 平空
    const eosPayload = {
      size: size * 10,
      type: 4,
      order_type: 4, //市价委托
      instrument_id: 'EOS-USD-201225'
    }
    const eosResult = await postFuturesOrder(eosPayload);
    console.log(eosResult)
    if(eosResult?.data?.result) message.success('EOS平仓成功');
  }

  const onStopMonitor = async () => {
    const { errcode, errmsg } = await stopMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  const onStartMonitor = async () => {
    const { errcode, errmsg } = await startMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  return <>
    <Card title="持仓情况" extra={<Button onClick={()=>getPosition()}>刷新</Button>}>
      <Row gutter={12}>
        <Col span={12}>
          <h3>BTC</h3>
          <p>ID：{btcPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(btcPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(btcPosition.updated_at).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{btcPosition.leverage}</p>
          <p>数量（张）：{btcPosition.long_qty}</p>
          <p>开仓均价：{btcPosition.long_avg_cost}</p>
          <p>最新成交价（美元）：{btcPosition.last}</p>
          <p>多仓保证金(BTC)：{btcPosition.long_margin}</p>
          <p>多仓收益(BTC)：{btcPosition.long_pnl}</p>
          <p>多仓收益率（%）：{Number(btcPosition.long_pnl_ratio) * 100}</p>
          <p>已实现盈余：{btcPosition.realised_pnl}</p>
          <p>收益折合（美元）：{Number(btcPosition.long_pnl) * Number(btcPosition.last)}</p>
          <p>已实现盈余折合（美元）：{Number(btcPosition.realised_pnl) * Number(btcPosition.last)}</p>
        </Col>
        <Col span={12}>
          <h3>EOS</h3>
          <p>ID：{eosPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(eosPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(eosPosition.updated_at).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{eosPosition.leverage}</p>
          <p>数量（张）：{eosPosition.short_qty}</p>
          <p>开仓均价：{eosPosition.short_avg_cost}</p>
          <p>最新成交价（美元）：{eosPosition.last}</p>
          <p>空仓保证金（EOS)：{eosPosition.short_margin}</p>
          <p>空仓收益（EOS)：{eosPosition.short_pnl}</p>
          <p>空仓收益率（%）：{Number(eosPosition.short_pnl_ratio) * 100}</p>
          <p>已实现盈余：{eosPosition.realised_pnl}</p>
          <p>收益折合（美元）：{Number(eosPosition.short_pnl) * Number(eosPosition.last)}</p>
          <p>已实现盈余折合（美元）：{Number(eosPosition.realised_pnl) * Number(eosPosition.last)}</p>
        </Col>
      </Row>
      <Divider />
      <Row>
        <Col span={24}>
          <h3>共计</h3>
          <p>收益（美元）：{Number(btcPosition.long_pnl) * Number(btcPosition.last) + Number(eosPosition.short_pnl) * Number(eosPosition.last)}</p>
          <p>收益率（%）：{(Number(btcPosition.long_pnl) * Number(btcPosition.last) + Number(eosPosition.short_pnl) * Number(eosPosition.last)) * 100 / ( Number(btcPosition.long_margin) * Number(btcPosition.last) + Number(eosPosition.short_margin) * Number(eosPosition.last)) }</p>
          <p>已实现盈余（美元）：{Number(btcPosition.realised_pnl) * Number(btcPosition.last) + Number(eosPosition.realised_pnl) * Number(eosPosition.last)}</p>
        </Col>
      </Row>
    </Card>
    <Card title={'交割合约'} style={{ marginTop: 10 }}>
      <span>设置杠杆倍数：</span><InputNumber value={leverage} step={1} onChange={v=>setLeverage(v)}/>
      <Divider type="vertical" />
      <span>开仓张数：</span><InputNumber value={size} step={1} onChange={v=>setSize(v)}/>
      <Button onClick={()=>onSetLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>

      <Divider type="horizontal" />

      <span>操作：</span>
      <Button onClick={()=>onStopMonitor()}>停止监控</Button>
      <Button onClick={()=>onStartMonitor()} type="primary" style={{ marginLeft: 10 }}>开始监控</Button>

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
    {/*<Card title={'永续合约'} style={{ marginTop: 10 }}>*/}
    {/*  <span>设置杠杆倍数：</span><InputNumber value={swapLeverage} step={1} onChange={v=>setSwapLeverage(v)}/>*/}
    {/*  <Button onClick={()=>onSetSwapLeverage()} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>*/}

    {/*  <Divider type="horizontal" />*/}

    {/*  <Popconfirm*/}
    {/*    title="是否确定以市价开仓？"*/}
    {/*    onConfirm={()=>openOrder()}*/}
    {/*    >*/}
    {/*    <Button>对冲开仓</Button>*/}
    {/*  </Popconfirm>*/}

    {/*  <Popconfirm*/}
    {/*    title="是否确定要全部平仓？"*/}
    {/*    onConfirm={()=>closeOrder()}*/}
    {/*  >*/}
    {/*    <Button type="primary" style={{ marginLeft: 10 }}>全平</Button>*/}
    {/*  </Popconfirm>*/}

    {/*</Card>*/}
  </>
}
