import React, { useState, useEffect, useRef } from 'react';
import { Card, Divider, Button, DatePicker, InputNumber, Select, Spin } from 'antd';
import SearchTable, { refreshTable } from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import {
  getOrders,
  getSwapInformation,
  getSwapInformationSentiment,
  getTradeFee,
  getHistory,
  testOrderApi,
  testOrderMultiApi,
  getMultiStatus
} from './api';
import { getSwapPosition } from '../../Swap/Trade/api'
import { tradeTypeEnum } from '../../config';

const { RangePicker } = DatePicker;

export default props => {
  const [pageLoading, setPageLoading] = useState(false);
  const [longShortRatioData, setLongShortRatioData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);
  const [feeObj, setFeeObj] = useState({});
  const ordersLimit = 40;
  const [current,setCurrent] = useState(1);
  const [pageSize,setPageSize] = useState(10);
  const [eosCurrent,setEosCurrent] = useState(1);
  const [eosPageSize,setEosPageSize] = useState(10);
  const [frequency, setFrequency] = useState(1);
  const winRatio = useRef(2);
  const lossRatio = useRef(0.6);
  const [changebleWinRatio, setChangebleWinRatio] = useState(2);
  const [changebleLossRatio, setChangebleLossRatio] = useState(0.6);
  const [tPnlList,setTPnlList] = useState([{}]);
  const [tPnl, setTPnl] = useState(0);
  const [tPnlRatio, setTPnlRatio] = useState(0);
  const [month,setMonth] = useState('10');
  const [leverage,setLeverage] = useState(10);
  const [duration,setDuration] = useState(3);

  const BTC_INSTRUMENT_ID = 'MNBTC-USD-SWAP';
  const SWAP_BTC_INSTRUMENT_ID = 'BTC-USD-SWAP';

  const monthMap = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  const initBTCData = async () => {
    const result = await getOrders({ instrument_id: BTC_INSTRUMENT_ID, limit: ordersLimit, state: 7 });
    return result;
  }

  const initEOSData = async () => {
    const result = await getOrders({ instrument_id: 'MNEOS-USD-SWAP', limit: ordersLimit, state: 7 });
    return result;
  }

  const getLongShortRatioData = async () => {
    const result = await getSwapInformation({ currency: 'BTC', granularity: 86400 * 10 });
    const data = result?.data??[];
    setLongShortRatioData(data.filter((_,index)=>index<40).map(item=>({ time: moment(item[0]).format('HH:mm:ss'), ratio: Number(item[1]) })));
  }

  const getSentiment = async () => {
    const result = await getSwapInformationSentiment({ currency: 'BTC', granularity: 86400 * 10 });
    const data = result?.data??[];
    const list = [];
    data.filter((_,index)=>index<40).map(item=>{
      list.push({
        time: moment(item[0]).format('HH:mm:ss'),
        ratio: Number(item[1]),
        type: '做多账户'
      });
      list.push({
        time: moment(item[0]).format('HH:mm:ss'),
        ratio: Number(item[2]),
        type: '做空账户'
      });
    })
    setSentimentData(list);
  }

  const getFee = async (params) => {
    const { data } = await getTradeFee(params);
    setFeeObj(data||{});
  }

  const initContinuousObj = {
    continuousLossNum: 0,
    continuousWinNum: 0,
  }

  let continuousObj = initContinuousObj;

  let isCurrentSideShort = false;
  let lastPrice = 0;
  let lastWinDirection = null; // 上次盈利方向
  let lastLossDirection = null;
  const testOrder = async (historyList,endPrice) => {
    if(!historyList.length) {
      return { time: 0, totalPnl: 0, totalRatio: 0, totalFee: 0, endPrice }
    }

    let totalPnl = 0;

    const position = 10;
    const margin = position * 100 / historyList[0][1] / leverage;
    let condition = leverage / 100;

    let primaryPrice = endPrice || historyList[0][1];
    let passNum = 0;
    let totalFee = 0;

    historyList.map(item=>{
      const size = Number(position) * 100 / Number(item[1]);
      let unrealized_pnl = size * (Number(item[1]) - Number(primaryPrice)) / Number(item[1])
      if(isCurrentSideShort) unrealized_pnl = -unrealized_pnl;

      const ratio = Number(unrealized_pnl) / Number(margin);

      let newWinRatio = Number(winRatio.current);
      let newLossRatio = Number(lossRatio.current);

      // if(continuousObj.continuousWinNum==1) {
      //   newLossRatio = newLossRatio / 2;
      //   newWinRatio = newWinRatio / 2;
      // }

      if(ratio < newLossRatio) console.info(item[0],'ratio',ratio, 'isCurrentSideShort', isCurrentSideShort)

      // 盈利
      if(ratio > condition * newWinRatio * frequency){
        const fee = Number(margin) * 5 * 2 / 10000;
        // console.log('totalFee',fee, fee / Number(margin))
        totalFee += fee;
        totalPnl += unrealized_pnl - fee;
        continuousObj.continuousLossNum = 0;
        continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

        let currentSide = 'long';
        if(isCurrentSideShort) currentSide = 'short';

        if(!(currentSide == 'short' && lastWinDirection == 'short') || (currentSide == 'long' && lastWinDirection == 'long')){
          isCurrentSideShort = !isCurrentSideShort;
        }

        lastWinDirection = currentSide;

        primaryPrice = item[1];
        // console.log('win::totalPnl',totalPnl, ratio,unrealized_pnl)
      }
      // 亏损，平仓，市价全平
      if(ratio < - condition * newLossRatio * frequency){
        const fee = Number(margin) * 5 * 2 / 10000;
        // console.log('totalFee',fee, fee / Number(margin))
        totalFee += fee;
        totalPnl += unrealized_pnl - fee;

        continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
        continuousObj.continuousWinNum = 0;

        let currentSide = 'long';
        if(isCurrentSideShort) currentSide = 'short';

        // isCurrentSideShort = !isCurrentSideShort;
        if((currentSide == 'short' && lastLossDirection == 'short') || (currentSide == 'long' && lastLossDirection == 'long')){
          isCurrentSideShort = !isCurrentSideShort;
        }

        lastWinDirection = currentSide;

        primaryPrice = item[1];

        console.log('------------continuousLossNum---------------')
        console.info(item[0],'continuousLossNum', continuousObj.continuousLossNum)
        console.info('ratio', ratio)
        console.log('lastWinDirection', lastWinDirection, 'newWinRatio', newWinRatio)
        console.log('------------continuousLossNum---------------')

      }
      console.log(item[0],ratio,primaryPrice,item[1],unrealized_pnl, margin, isCurrentSideShort, condition)
      // console.log('continuousWinNum',continuousObj.continuousWinNum, 'continuousLossNum', continuousObj.continuousLossNum)
    })

    const totalRatio = totalPnl * 100 / Number(margin);
    // setTPnl(totalPnl)
    // setTpnlRatio(totalPnl * 100 / Number(margin))

    // console.log('totalPnl',totalPnl, totalFee, margin, totalRatio,  )
    return { time: historyList[0][0], totalPnl, totalRatio, totalFee, endPrice: primaryPrice }
  }

  const getMonthPnl = async day => {
    let loopNum = 0;
    let list = [];
    let t = 0;
    let tRatio = 0;

    while(loopNum < 134) {
      const start = moment(day,'YYYY-MM-DD HH:mm:ss').add((loopNum + 1) * 5,'hours').toISOString();
      const end = moment(day,'YYYY-MM-DD HH:mm:ss').add(loopNum * 5,'hours').toISOString();
      const result = await getHistory({
        instrument_id: 'BTC-USD-SWAP',
        granularity: 60,
        // limit: 20,
        start,
        end
      })

      const data = result?.data;

      if(Array.isArray(data)){
        const result = await testOrder(data.reverse(),lastPrice);
        // console.log(start,result.totalPnl,result.totalRatio)
        t += result.totalPnl;
        tRatio += result.totalRatio;
        list.push(result);
        loopNum++;
        lastPrice = result.endPrice;
      }
    }
    return { pnl: t, ratio: tRatio };
  }

  const fnGetHistory = async () => {
    setPageLoading(true);

    // let t = 0;
    // let tRatio = 0;
    // let mList = [];
    // let i = 0;
    // while(i<duration) {
    //   const firstDay = `2020-${monthMap[i]}-01 00:00:00`;
    //
    //   const payload = {
    //     date: firstDay,
    //     leverage,
    //     winRatio,
    //     lossRatio,
    //     frequency
    //   }
    //
    //   // const { data: {pnl, ratio} } = await testOrderApi(payload);
    //   const { pnl , ratio } = await getMonthPnl(firstDay);
    //
    //   console.log('pnl,ratio',monthMap[i],pnl,ratio)
    //   t += pnl;
    //   tRatio += ratio;
    //   mList.push({
    //     month: monthMap[i],
    //     totalPnl: pnl,
    //     totalRatio: ratio
    //   })
    //   i++;
    // }
    //
    // setTPnlList(mList);
    // setTPnl(t);
    // setTPnlRatio(tRatio);

    const payload = {
      duration,
      leverage,
      winRatio: winRatio.current,
      lossRatio: lossRatio.current,
      frequency
    }

    await testOrderMultiApi(payload);

    let myInterval;
    myInterval = setInterval(async ()=>{
      const res = await getMultiStatus()
      const { status, result } = res?.data??{}
      if(status){
        console.log(result)
        const { mList = [], pnl, ratio} = result

        setTPnlList(mList);
        setTPnl(pnl);
        setTPnlRatio(ratio);

        setPageLoading(false);

        clearInterval(myInterval);
        myInterval = null
      }
    }, 1000 * 10)
  }

  const fnGetHistoryByMonth = async () => {
    setPageLoading(true);
    const firstDay = `2020-${month}-01 00:00:00`;

    const payload = {
      date: firstDay,
      leverage,
      winRatio: winRatio.current,
      lossRatio: lossRatio.current,
      frequency
    }

    // const { data: {pnl, ratio} } = await testOrderApi(payload);
    const { pnl , ratio } = await getMonthPnl(firstDay);

    setTPnl(pnl);
    setTPnlRatio(ratio);
    setPageLoading(false);
  }

  useEffect(()=>{
    // getLongShortRatioData();
    // getSentiment();
    getFee({ instrument_id : BTC_INSTRUMENT_ID });
    // fnGetHistory();
  },[])

  const getColumns = ps => ([{
    dataIndex: 'index',
    title: '序号',
    render:(text,__,index)=> {
      if(index+1==ps) return text;
      return ++index
    }
  },
  //   {
  //   dataIndex: 'order_id',
  //   title: '订单ID'
  // },
  //   {
  //   dataIndex: 'instrument_id',
  //   title: '合约ID'
  // },
    {
    dataIndex: 'type',
    title: '交易类型',
    render: text=>tradeTypeEnum[text]
  },{
    dataIndex: 'size',
    title: '数量（张）'
  },{
    dataIndex: 'price_avg',
    title: '成交均价'
  },{
    dataIndex: 'timestamp',
    title: '成交时间',
    render: (text,record,index)=> {
      if(index+1==ps) return '';
      return moment(text).format('YYYY-MM-DD HH:mm:ss')
    }
  },{
    dataIndex: 'leverage',
    title: '杠杆倍数'
  },
  //   {
  //   dataIndex: 'fee',
  //   title: '手续费'
  // },
    {
      dataIndex: 'bzj-usd',
      title: '保证金（美元）',
      render: (_,{size, contract_val, price_avg, leverage},index)=> {
        if(index+1==ps) return '';
        return (Number(size) * Number(contract_val) / leverage).toFixed(2)
      }
    },
    {
      dataIndex: 'feeUsd',
      title: '手续费（美元）',
      render: (text,record,index) => {
        if (index + 1 == ps) return text ? text.toFixed(2) : '';
        return (Number(record.fee) * Number(record.price_avg)).toFixed(2)
      }
    },
    {
      dataIndex: 'feeUsdPercent',
      title: '手续费占比(%)',
      render: (text,{size, fee, contract_val, price_avg, leverage},index) => {
        if(index+1==ps) return text ? text.toFixed(2) : '';
        return ( Number(fee) * Number(price_avg) * 100 / (Number(size) * Number(contract_val) / leverage) ).toFixed(2)
      }
  },
    {
      dataIndex: 'value',
      title: '合约价值',
      render: (text,{type, size, price_avg},index)=>{
        if(index+1==ps) return text ? text.toFixed(2) : '';
        return (type == 1 || type == 2) ? ( Number(size) * Number(price_avg) ) : ( - Number(size) * Number(price_avg))
      }
    }
  //   {
  //   dataIndex: 'pnl',
  //   title: '盈亏'
  // },
  //   {
  //   dataIndex: 'pnlUsd',
  //   title: '盈亏（美元）',
  //   render: (text,record,index) => {
  //     if(index+1==ps) return text ? text.toFixed(2) : '';
  //     return (Number(record.pnl) * Number(record.price_avg)).toFixed(2)
  //   }
  // },{
  //     dataIndex: 'ratio',
  //     title: '盈亏占比',
  //     render: (text,{ fee, size, contract_val, price_avg, leverage, pnl },index) => {
  //       if(index+1==ps) return text ? (text.toFixed(2) + '%') : '-';
  //       return ( (Number(fee) * Number(price_avg) + Number(pnl) * Number(price_avg)) * 100 / (Number(size) * Number(contract_val) / Number(leverage))).toFixed(2) + '%'
  //     }
  //   }
    ]);

  const responseHandler = (data, cr, ps)=>{
    if(Array.isArray(data)) data = { order_info: data };
    const records = data.order_info;
    let bzjUsd = 0;
    let feeUsd = 0;
    let pnlUsd = 0;
    let value = 0;
    // let ratio = 0;
    records.some(({ type, size, contract_val, price_avg, leverage, pnl, fee }, index) => {
      if((index >= (cr - 1) * ps) && (index < cr * ps)){
        bzjUsd += Number(size) * Number(contract_val) / Number(leverage)
        feeUsd += Number(fee) * Number(price_avg);
        pnlUsd += Number(pnl) * Number(price_avg);
        value += (type == 1 || type == 2) ? (Number(size) * Number(price_avg)) : ( - Number(size) * Number(price_avg));
        // ratio += Number(pnl) * Number(price_avg) * 100 / (Number(size) * Number(contract_val) / Number(leverage))
      }
      if(index == cr * ps - 2) return true;
    });
    records.splice((cr * ps-1), 0, {
      index: '总计',
      feeUsd,
      pnlUsd,
      feeUsdPercent: feeUsd * 100 / bzjUsd,
      value,
      ratio: ( feeUsd + pnlUsd ) * 100 / (bzjUsd / (ps - 1))
    });
    return { records };
  }

  const disabledDate = current => {
    return current && current > moment().endOf('day');
  }

  return <Spin spinning={pageLoading}>
    <Card title='概况'>
      <p>手续费率：
        手续费档位: {feeObj.category} <Divider type='vertical' />
        吃单手续费率: {feeObj.taker} <Divider type='vertical' />
        挂单手续费率: {feeObj.maker} <Divider type='vertical' />
        时间: {moment(feeObj.timestamp).format('YYYY-MM-DD HH:mm:ss')} <Divider type='vertical' />
        {/*交割手续费率: {feeObj.delivery} <Divider type='vertical' />*/}
      </p>
      <Divider />

      frequency:
      <InputNumber
        value={ frequency }
        step={0.1}
        min={0.1}
        max={10}
        onChange={v=>setFrequency(Number(v))}
      />

      winRatio:
      <InputNumber
        value={ changebleWinRatio }
        step={0.1}
        min={0.1}
        max={10}
        onChange={v=> {
          setChangebleWinRatio(Number(v))
          winRatio.current = (Number(v))
        }}
      />

      lossRatio:
      <InputNumber
        value={ changebleLossRatio }
        step={0.1}
        min={0.1}
        max={10}
        onChange={v=> {
          setChangebleLossRatio(Number(v))
          lossRatio.current = (Number(v))
        }}
      />

      杠杆:
      <InputNumber
        value={ leverage }
        step={1}
        min={1}
        max={100}
        onChange={v=>setLeverage(Number(v))}
      />

      月份：
      <Select value={month} onChange={v=>{setMonth(v)}} style={{ width: 120 }}>
        {
          monthMap.map(item=>{
            return  <Select.Option value={item} key={item}>{item}</Select.Option>
          })
        }
      </Select>

      <Button onClick={()=>fnGetHistoryByMonth()} type="primary" style={{ marginLeft: 10 }}>确定</Button>

      <Divider />

      查询时长:
      <InputNumber
        value={ duration }
        step={1}
        min={1}
        max={12}
        onChange={v=>setDuration(Number(v))}
      />
      个月
      <Button onClick={()=>fnGetHistory()} type="primary" style={{ marginLeft: 10 }}>测算</Button>
      <Divider />
      {/*历史数据范围：*/}
      {/*<RangePicker*/}
      {/*  showTime*/}
      {/*  showNow*/}
      {/*  onChange={fnGetHistory}*/}
      {/*  disabledDate={disabledDate}*/}
      {/*  defaultValue={[moment('2020-10-01 00:00:00','YYYY-MM-DD HH:mm:ss'),moment('2020-09-03 00:00:00','YYYY-MM-DD HH:mm:ss')]}*/}
      {/*/>*/}

      {/*<Divider />*/}

      {
        tPnlList.map((item,index)=>{
          return <div key={item.month}>
            <p>月份：{item.month}</p>
            <p>盈亏：{item.totalPnl} </p>
            <p>盈亏比：{item.totalRatio}</p>
          </div>
        })
      }

      <p>总盈亏：{tPnl} </p>
      <p>总盈亏比：{tPnlRatio}</p>

    </Card>
    <Card title={'BTC交易记录'} >
      <SearchTable
        columns={getColumns(pageSize)}
        getList={initBTCData}
        responseHandler={data=>responseHandler(data,current,pageSize)}
        rowKey={"order_id"}
        tableId={"btc"}
        key={'btc'}
        callbackPageSize={(cr,ps)=> {
          setCurrent(cr)
          setPageSize(ps)
        }}
      />
    </Card>
    {/*<Card title={'EOS交易记录'} style={{ marginTop: 10 }} extra={<Button onClick={()=>{refreshTable('eos')}}>刷新</Button>}>*/}
    {/*  <SearchTable*/}
    {/*    columns={getColumns(eosPageSize)}*/}
    {/*    getList={initEOSData}*/}
    {/*    responseHandler={data=>responseHandler(data,eosCurrent,eosPageSize)}*/}
    {/*    rowKey={"order_id"}*/}
    {/*    tableId={"eos"}*/}
    {/*    key={'eos'}*/}
    {/*    callbackPageSize={(cr,ps)=> {*/}
    {/*      setEosCurrent(cr)*/}
    {/*      setEosPageSize(ps)*/}
    {/*    }}*/}
    {/*  />*/}
    {/*</Card>*/}
    {/*<Card title={'多空人数比'} style={{ marginTop: 10 }}>*/}
    {/*  {*/}
    {/*    longShortRatioData.length ? (*/}
    {/*      <Line*/}
    {/*        {...lineConfig}*/}
    {/*        height={300}*/}
    {/*        data={longShortRatioData}*/}
    {/*        xField = 'time'*/}
    {/*        yField = 'ratio'*/}
    {/*        meta = {{*/}
    {/*          time: { alias: '时间' },*/}
    {/*          ratio: { alias: '多空人数比' },*/}
    {/*        }}*/}
    {/*        point = {{*/}
    {/*          visible: true,*/}
    {/*          size: 5,*/}
    {/*          shape: 'diamond',*/}
    {/*          style: {*/}
    {/*            fill: 'white',*/}
    {/*            stroke: '#2593fc',*/}
    {/*            lineWidth: 2,*/}
    {/*          },*/}
    {/*        }}*/}
    {/*      />*/}
    {/*    ) : ''*/}
    {/*  }*/}
    {/*</Card>*/}
    {/*<Card title={'多空精英趋向指标'} style={{ marginTop: 10 }}>*/}
    {/*  {*/}
    {/*    longShortRatioData.length ? (*/}
    {/*      <Line*/}
    {/*        {...lineConfig}*/}
    {/*        height={300}*/}
    {/*        data={sentimentData}*/}
    {/*        xField = 'time'*/}
    {/*        yField = 'ratio'*/}
    {/*        seriesField = 'type'*/}
    {/*        meta = {{*/}
    {/*          time: { alias: '时间' },*/}
    {/*          ratio: { alias: '多空人数比' },*/}
    {/*        }}*/}
    {/*      />*/}
    {/*    ) : ''*/}
    {/*  }*/}
    {/*</Card>*/}
  </Spin>
}
