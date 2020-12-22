import React,{ useState, useEffect, useRef } from 'react';
import { Button, InputNumber, Card, message, Divider, Popconfirm, Row, Col, Radio, Tabs } from 'antd';
import {
  postSwapLeverage,
  postSwapOrder,
  getSwapAccount,
  getSwapPosition,
  getSwapLeverage,
  startMonitor,
  stopMonitor,
  changeMode,
  getSwapAccounts,
  getSwapMarkPrice,
  autoCloseOrderByInstrumentId,
  setFrequencyApi,
  setContinousWinAndLoss
} from './api'
import moment from 'moment'

const BTC_INSTRUMENT_ID = 'BTC-USD-SWAP';
const EOS_INSTRUMENT_ID = 'EOS-USD-SWAP';

export default props => {
  const [btcLeverage, setBtcLeverage] = useState(10);
  const [eosLeverage, setEosLeverage] = useState(10);
  const [swapLeverage, setSwapLeverage] = useState(5);
  const [size, setSize] = useState(1);
  const [btcLongPosition, setBtcLongPosition] = useState({});
  const [btcShortPosition, setBtcShortPosition] = useState({});
  const [eosLongPosition, setEosLongPosition] = useState({});
  const [eosShortPosition, setEosShortPosition] = useState({});
  const [btcAccount, setBtcAccount] = useState({});
  const [eosAccount, setEosAccount] = useState({});
  const [btcMarkPrice, setBtcMarkPrice] = useState(0);
  const [eosMarkPrice, setEosMarkPrice] = useState(0);
  const [position, setPosition] = useState(0.5);
  const [frequency, setFrequency] = useState(1);
  const [currentInstrumentId, setCurrentInstrumentId] = useState(BTC_INSTRUMENT_ID);
  const [continuousWinNum, setContinuousWinNum] = useState(0);
  const [continuousLossNum, setContinuousLossNum] = useState(0);

  const onSetContinousWinAndLoss = async () => {
    const payload = {
      instrument_id: BTC_INSTRUMENT_ID,
      continuousWinNum: 0,
      continuousLossNum: 2,
      lastWinDirection : 'long',
      lastLastWinDirection: 'short',
      lastLossDirection: 'short',
      lastLastLossDirection: 'short',
      continuousWinSameSideNum: 0,
      continuousLossSameSideNum: 2,
      lastMostWinRatio: 0.3241,
      initPosition: 20,
      isOpenOtherOrder: false
    }
    const { errcode, errmsg } = await setContinousWinAndLoss(payload)
    if(errcode == 0)  message.success(errmsg);
  }

  const getPosition = async () => {
    const result = await getSwapPosition({instrument_id: BTC_INSTRUMENT_ID});
    const { side } = result?.data?.holding[0]??{};
    if(side == 'long') {
      setBtcLongPosition(result?.data?.holding[0]);
      setBtcShortPosition({})
    }else{
      setBtcLongPosition({});
      setBtcShortPosition(result?.data?.holding[0])
    }
    const eosResult = await getSwapPosition({instrument_id: EOS_INSTRUMENT_ID});
    const { side: eosSide } = eosResult?.data?.holding[0]??{};
    if(eosSide == 'long') {
      setEosLongPosition(eosResult?.data?.holding[0]);
      setEosShortPosition({})
    }else{
      setEosLongPosition({});
      setEosShortPosition(eosResult?.data?.holding[0])
    }
  }

  const getLeverage = async () => {
    const { data: result } = await getSwapLeverage({ instrument_id: BTC_INSTRUMENT_ID });
    setBtcLeverage(result['long_leverage']);
    const { data: eosResult } = await getSwapLeverage({ instrument_id: EOS_INSTRUMENT_ID });
    setEosLeverage(eosResult['long_leverage']);
  }

  const getAccounts = async () => {
    const result = await getSwapAccounts({ instrument_id: BTC_INSTRUMENT_ID });
    setBtcAccount(result?.data?.info??{})
    const eosResult = await getSwapAccounts({ instrument_id: EOS_INSTRUMENT_ID });
    setEosAccount(result?.data?.info??{})
  }

  const getMarkPrice = async () => {
    const result = await getSwapMarkPrice({ instrument_id: BTC_INSTRUMENT_ID });
    setBtcMarkPrice(result?.data?.mark_price)
    const eosResult = await getSwapMarkPrice({ instrument_id: EOS_INSTRUMENT_ID });
    setEosMarkPrice(eosResult?.data?.mark_price)
  }

  const onSetFrequency = async () => {
    const { errcode, errmsg } = await setFrequencyApi({ frequency: frequency });
    if(errcode == 0)  message.success(errmsg);
  }

  useEffect(()=>{
    getPosition();
    getLeverage();
    getAccounts();
    getMarkPrice();
  },[])

  const onSetLeverage = async ({ leverage, instrument_id, currency }) => {
    const result = await postSwapLeverage({ leverage, instrument_id, side: '1' })
    const data = result?.data;
    await postSwapLeverage({ leverage, instrument_id, side: '2' })
    if(data) message.success(`${currency}杠杆设置成功`);
  }

  const openOrder = async (type, currency) => {
    const payload = {
      size,
      type: type,
      // order_type: 0, //1：只做Maker 4：市价委托
      price: currency == 'BTC' ? btcMarkPrice : eosMarkPrice,
      instrument_id: currentInstrumentId,
      match_price: 0
    }
    const result = await postSwapOrder(payload);
    console.log(result)
    if(result?.data?.result) message.success(`${currency}开仓成功`);
  }

  const closeOrder = async (currency) => {
    const position = currency == 'BTC' ? ( Number(btcLongPosition.position) ? btcLongPosition : btcShortPosition ) : ( Number(eosLongPosition.position) ? eosLongPosition : eosShortPosition );
    const price = currency == 'BTC' ? btcMarkPrice : eosMarkPrice;
    if(Number(position.position)) {
      const payload = {
        size: Number(position.avail_position),
        type: position.side == 'long' ? 3 : 4,
        // order_type: 0, //1：只做Maker 4：市价委托
        price,
        instrument_id: position.instrument_id,
        match_price: 0
      }
      const result = await postSwapOrder(payload);
      console.log(result)
      if(result?.data?.result) message.success(`${currency}平仓挂单成功`);
    }
  }

  const closeOrderByMarkPrice = async (currency) => {
    const position = currency == 'BTC' ? [btcLongPosition, btcShortPosition] : [eosLongPosition,eosShortPosition];
    const result = await autoCloseOrderByInstrumentId({ instrument_id: position[0].instrument_id, direction: Number(position[0].position) ? 'long' : 'short'})
    if(result?.data?.result) message.success(`${currency}平仓成功`)
  }

  const onStopMonitor = async () => {
    const { errcode, errmsg } = await stopMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  const onStartMonitor = async () => {
    const { errcode, errmsg } = await startMonitor();
    if(errcode == 0)  message.success(errmsg);
  }

  const onChangeMode = async (mode = 1) => {
    console.log(mode)
    const { errcode, errmsg } = await changeMode({ mode });
    if(errcode == 0)  message.success(errmsg);
  }

  // 共计收益
  const pnl = (Number(btcLongPosition.unrealized_pnl)+Number(btcShortPosition.unrealized_pnl)) * Number(btcLongPosition.last) + (Number(eosLongPosition.unrealized_pnl)+Number(eosShortPosition.unrealized_pnl)) * Number(eosLongPosition.last);
  // 共计保证金
  const margin = (Number(btcLongPosition.margin)+Number(btcShortPosition.margin)) * Number(btcLongPosition.last) + (Number(eosLongPosition.margin)+Number(eosShortPosition.margin)) * Number(eosLongPosition.last);

  // btc余额
  const { equity, contracts = [{}], total_avail_balance } = btcAccount;
  const { margin_frozen, margin_for_unfilled } = contracts[0];
  const available_qty = Number(equity) - Number(margin_frozen) - Number(margin_for_unfilled);

  // eos余额
  const { equity: eosEquity, contracts: eosContracts = [{}], total_avail_balance: eos_total_avail_balance } = eosAccount;
  const { margin_frozen: eos_margin_frozen, margin_for_unfilled: eos_margin_for_unfilled } = eosContracts[0];
  const eos_available_qty = Number(eosEquity) - Number(eos_margin_frozen) - Number(eos_margin_for_unfilled);

  const OrderPanelC = ({ currency, instrument_id, leverage }) => (<>
    <span>设置杠杆倍数：</span>
    <InputNumber
      value={ currency == 'BTC' ? btcLeverage : eosLeverage }
      step={1}
      min={1}
      max={100}
      onChange={v=> {
        currency == 'BTC' ? setBtcLeverage(v) : setEosLeverage(v)
      }}
    />
    <Divider type="vertical" />
    <span>开仓张数：</span><InputNumber value={size} step={1} min={1} onChange={v=>setSize(v)}/>
    <Button onClick={()=>onSetLeverage({ currency, instrument_id, leverage })} type={'primary'} style={{ marginLeft: 10 }}>确定</Button>

    <Divider type="horizontal" />

    <Popconfirm
      title={`是否确定开${currency}多仓？`}
      onConfirm={()=>openOrder(1, currency)}
    >
      <Button>开多</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定开${currency}空仓？`}
      onConfirm={()=>openOrder(2, currency)}
    >
      <Button style={{ marginLeft: 10 }}>开空</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定要${currency}平仓？`}
      onConfirm={()=>closeOrder(currency)}
    >
      <Button type="primary" style={{ marginLeft: 10 }}>平仓</Button>
    </Popconfirm>

    <Popconfirm
      title={`是否确定要${currency}市价平仓？`}
      onConfirm={()=>closeOrderByMarkPrice(currency)}
    >
      <Button type="primary" style={{ marginLeft: 10 }}>市价平仓</Button>
    </Popconfirm>
  </>)

  return <>
    <Card title="持仓情况" extra={<Button onClick={()=>getPosition()}>刷新</Button>}>
      <Row gutter={12}>
        <Col span={12}>
          <h3>BTC</h3>
          <p>ID：{btcLongPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(btcPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(btcLongPosition.timestamp).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{btcLongPosition.leverage}</p>
          <p>数量（张）：多 {btcLongPosition.position} 空 {btcShortPosition.position}</p>
          <p>开仓均价：{btcLongPosition.avg_cost}</p>
          <p>最新成交价（美元）：{btcLongPosition.last}</p>
          <p>多仓保证金(BTC)：{btcLongPosition.margin}</p>
          <p>多仓收益(BTC)：{btcLongPosition.unrealized_pnl}</p>
          <p>多仓收益率（%）：{Number(btcLongPosition.margin) && (Number(btcLongPosition.unrealized_pnl) / Number(btcLongPosition.margin) * 100)}</p>
          <p>空仓保证金（BTC)：{btcShortPosition.margin}</p>
          <p>空仓收益（BTC)：{btcShortPosition.unrealized_pnl}</p>
          <p>空仓收益率（%）：{Number(btcShortPosition.margin) && (Number(btcShortPosition.unrealized_pnl) / Number(btcShortPosition.margin) * 100)}</p>
          <p>已实现盈余：{Number(btcShortPosition.realized_pnl) + Number(btcShortPosition.realized_pnl)}</p>
          <p>保证金折合（美元）：{Number(btcLongPosition.margin) * Number(btcLongPosition.last) + Number(btcShortPosition.margin) * Number(btcShortPosition.last)}</p>
          {/*<p>收益折合（美元）：{Number(btcLongPosition.realized_pnl) * Number(btcLongPosition.last) + Number(btcShortPosition.realized_pnl) * Number(btcShortPosition.last)}</p>*/}
          <p>已实现盈余折合（美元）：{Number(btcLongPosition.realized_pnl) * Number(btcLongPosition.last) + Number(btcShortPosition.realized_pnl) * Number(btcShortPosition.last)}</p>
        </Col>
        <Col span={12}>
          <h3>EOS</h3>
          <p>ID：{eosLongPosition.instrument_id}</p>
          {/*<p>成交时间：{moment(btcPosition.created_at).format('YYYY-MM-DD hh:mm:ss')}</p>*/}
          <p>更新时间：{moment(eosLongPosition.timestamp).format('YYYY-MM-DD HH:mm:ss')}</p>
          <p>杠杆倍数：{eosLongPosition.leverage}</p>
          <p>数量（张）：多 {eosLongPosition.position} 空 {eosShortPosition.position}</p>
          <p>开仓均价：{eosLongPosition.avg_cost}</p>
          <p>最新成交价（美元）：{eosLongPosition.last}</p>
          <p>多仓保证金(EOS)：{eosLongPosition.margin}</p>
          <p>多仓收益(EOS)：{eosLongPosition.unrealized_pnl}</p>
          <p>多仓收益率（%）：{Number(eosLongPosition.margin) && (Number(eosLongPosition.unrealized_pnl) / Number(eosLongPosition.margin) * 100)}</p>
          <p>空仓保证金（EOS)：{eosShortPosition.margin}</p>
          <p>空仓收益（EOS)：{eosShortPosition.unrealized_pnl}</p>
          <p>空仓收益率（%）：{Number(eosShortPosition.margin) && (Number(eosShortPosition.unrealized_pnl) / Number(eosShortPosition.margin) * 100)}</p>
          <p>已实现盈余：{Number(eosShortPosition.realized_pnl) + Number(eosShortPosition.realized_pnl)}</p>
          <p>保证金折合（美元）：{Number(eosLongPosition.margin) * Number(eosLongPosition.last) + Number(eosShortPosition.margin) * Number(eosShortPosition.last)}</p>
          {/*<p>收益折合（美元）：{Number(btcLongPosition.realized_pnl) * Number(btcLongPosition.last) + Number(btcShortPosition.realized_pnl) * Number(btcShortPosition.last)}</p>*/}
          <p>已实现盈余折合（美元）：{Number(eosLongPosition.realized_pnl) * Number(eosLongPosition.last) + Number(eosShortPosition.realized_pnl) * Number(eosShortPosition.last)}</p>
        </Col>
      </Row>
      <Divider />
      <Row>
        <Col span={24}>
          <h3>共计</h3>
          <p>收益（美元）：{pnl}</p>
          <p>收益率（%）：{pnl/margin*100}</p>
          <p>已实现盈余（美元）：{
            Number(btcLongPosition.realised_pnl) * Number(btcLongPosition.last)
            + Number(btcShortPosition.realised_pnl) * Number(btcShortPosition.last)
            + Number(eosLongPosition.realised_pnl) * Number(eosLongPosition.last)
            + Number(eosShortPosition.realised_pnl) * Number(eosShortPosition.last)
          }</p>
        </Col>
      </Row>
    </Card>
    <Card title={'合约账户信息'} style={{ marginTop: 10 }}>
      <p>
        BTC余额：{total_avail_balance}
        <Divider type="vertical" />
        标记价格：{btcMarkPrice}
        <Divider type="vertical" />
        可开张数：{ Math.floor(Number(total_avail_balance) * Number(btcMarkPrice) * btcLeverage * 0.98 / 100) }
      </p>
      <p>
        EOS余额：{eos_total_avail_balance}
        <Divider type="vertical" />
        标记价格：{eosMarkPrice}
        <Divider type="vertical" />
        可开张数：{ Math.floor(Number(eos_total_avail_balance) * Number(eosMarkPrice) * eosLeverage * 0.98 / 10) }
      </p>
    </Card>
    <Card title={'永续合约'} style={{ marginTop: 10 }}>
      <Tabs defaultActiveKey={BTC_INSTRUMENT_ID} onChange={key=>setCurrentInstrumentId(key)}>
        <Tabs.TabPane tab="BTC" key={BTC_INSTRUMENT_ID}>
          <OrderPanelC instrument_id={BTC_INSTRUMENT_ID} currency={"BTC"} leverage={btcLeverage} />
        </Tabs.TabPane>
        <Tabs.TabPane tab="EOS" key={EOS_INSTRUMENT_ID}>
          <OrderPanelC instrument_id={EOS_INSTRUMENT_ID} currency={"EOS"} leverage={eosLeverage} />
        </Tabs.TabPane>
      </Tabs>
    </Card>
    <Card title={'操作'} style={{ marginTop: 10 }}>
      {/*<p>下单模式：*/}
      {/*  <Radio.Group defaultValue="1" buttonStyle="solid" onChange={e=>onChangeMode(e.target.value)}>*/}
      {/*    <Radio.Button value="1">模式1</Radio.Button>*/}
      {/*    <Radio.Button value="2">模式2</Radio.Button>*/}
      {/*  </Radio.Group>*/}
      {/*</p>*/}
      {/*<p>开仓仓位：*/}
      {/*  <Radio.Group defaultValue={position} buttonStyle="solid" onChange={e=>setPosition(e.target.value)}>*/}
      {/*    <Radio.Button value={0.5}>半仓</Radio.Button>*/}
      {/*    <Radio.Button value={1}>全仓</Radio.Button>*/}
      {/*  </Radio.Group>*/}
      {/*</p>*/}
      <p>交易频次：
        <InputNumber value={frequency} step={0.1} min={0.1} onChange={v=>setFrequency(v)}/>
        <Button onClick={()=>onSetFrequency()} style={{ marginLeft: 10 }}>确定</Button>
      </p>
      <Divider type="horizontal" />

      <Button onClick={()=>onStopMonitor()}>停止监控</Button>
      <Button onClick={()=>onStartMonitor()} type="primary" style={{ marginLeft: 10 }}>开始监控</Button>

      <Divider type="horizontal" />

      <p>已盈亏次数：
        盈利：<InputNumber value={continuousWinNum} step={1} min={0} onChange={v=>setContinuousWinNum(v)}/>
        亏损：<InputNumber value={continuousLossNum} step={1} min={0} onChange={v=>setContinuousLossNum(v)}/>
        <Button onClick={()=>onSetContinousWinAndLoss()} style={{ marginLeft: 10 }}>确定</Button>
      </p>

    </Card>
  </>
}
