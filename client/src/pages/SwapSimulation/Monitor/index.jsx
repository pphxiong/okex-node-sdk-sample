import React, { useState, useEffect, useRef } from 'react';
import { Card, Divider, Button, DatePicker, InputNumber, Select, Spin, message } from 'antd';
import SearchTable, { refreshTable } from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import {
  startHearBeat,
  reset,
  getHistory,
  getLatestProfit
} from './api';
import { tradeTypeEnum } from '../../config';
// import { getRSI, getMacd } from '@/utils/utils'

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
  const lossRatio = useRef(9);
  const [changebleWinRatio, setChangebleWinRatio] = useState(2);
  const [changebleLossRatio, setChangebleLossRatio] = useState(9);
  const [tPnlList,setTPnlList] = useState([{}]);
  const [tPnl, setTPnl] = useState(0);
  const [tPnlRatio, setTPnlRatio] = useState(0);
  const [month,setMonth] = useState('06');
  const [leverage,setLeverage] = useState(10);
  const [duration,setDuration] = useState(11);
  const [dayStep, setDayStep] = useState(0);
  const [date,setDate] = useState("");

  const monthMap = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  const fnReset = async () => {
    const { errmsg } = await reset();
    message.info(errmsg)
  }

  const fnGetLatestProfit = async () => {
    setPageLoading(true)
    const time = moment().valueOf();
    const payload = { time }
    const { data } = await getLatestProfit(payload)
    setPageLoading(false)
  }

  function downLoad(content,fileName){
    const aEle = document.createElement("a");// 创建a标签
    const blob = new Blob([content]);
    aEle.download = fileName;// 设置下载文件的文件名

    const reader = new FileReader();
    reader.readAsDataURL(blob); // 转换为base64，可以直接放入a表情href
    reader.onload = function (e) {
      // 转换完成，创建一个a标签用于下载
      const a = document.createElement("a");
      a.download = fileName + ".js";
      a.href = e.target.result;
      a.click();
    };
  }

  const fnGetHistoryByMonth = async () => {
    if(!month) {
      message.warning('请先选择月份');
      return;
    }
    const dayList = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'];

    const yearAndMonth = `2021-${month}`

    let i = 0;
    let hData = [];
    const p = new Promise(resolve => {
        const getData = async (timeP) => {
          const payload = { time: moment(timeP).valueOf() }
          const { data } = await getHistory(payload)
          hData = hData.concat(data);

          const content = `const mockData = ${JSON.stringify(data)};
          module.exports.mockData = mockData;`;

          const fileName = `${timeP.split(' ')[0]}`;
          downLoad(content,fileName);

          if(i < dayList.length - 1){
            i++;
            const time = `${yearAndMonth}-${dayList[i]} 00:00:00`;
            await getData(time);
          }else{
            resolve()
          }
        }
        const time = `${yearAndMonth}-${dayList[i]} 00:00:00`;
        getData(time);
    })

    p.then(()=>{
      console.log('end')
    })
  }

  const fnGetHistoryByDay = async () => {
    if(!date) {
      message.warning('请先选择日期');
      return;
    }
    const time = `${date} 00:00:00`;
    const INIT_TIME = moment(time).valueOf();
    let hData = []
    const p = new Promise(resolve => {
      const getData = async () => {
        const payload = { time: INIT_TIME }
        const { data } = await getHistory(payload)
        hData = hData.concat(data);
        resolve(hData);
      }
      getData();
    })
    p.then(data=>{
      console.log(JSON.stringify(data))
      const content = `const mockData = ${JSON.stringify(data)};
      module.exports.mockData = mockData;`;

      const fileName = `${time.split(' ')[0]}`;
      downLoad(content,fileName);
    })
  }

  const fnGetProfitByMonth = async () => {
    try{
      setPageLoading(true);
      const dayList = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
        '21','22','23','24','25','26','27','28','29','30'];

      const profitList = []
      const yearAndMonth = `2021-${month}`;
      let i = 0;
      const p = new Promise(async resolve => {
        const getDayData = async date => {
          const payload = { date }
          const { data } = await startHearBeat(payload);
          if(data){
            const { dealDetailList, totalProfit } = data;
            const dayProfit = {
              profit: totalProfit,
              date,
              dealDetailList,
            }
            profitList.push(dayProfit);

            i++;
            if(i >= dayList.length){
              resolve(profitList);
              return;
            }
            const newDate = `${yearAndMonth}-${dayList[i]}`;
            await getDayData(newDate);
          }
        }
        const date = `${yearAndMonth}-${dayList[i]}`;
        await getDayData(date);
      })

      p.then(data=>{
        setTPnlList(data);
        let tProfit = 0;
        data.map(item=>{ tProfit += item.profit });
        setTPnlRatio(tProfit)
      }).finally(()=>{
        setPageLoading(false);
      })
    }catch (e) {
       console.log(e)
    }
  }


  const fnGetProfitByDay = async () => {
    if(!date) {
      message.warning('请先选择日期');
      return;
    }
    setPageLoading(true)
    const INIT_DATE = date;
    const payload = { date: INIT_DATE }
    const { data } = await startHearBeat(payload)
    if(data){
      const { history, currentPosition, totalProfit } = data;
      console.log(JSON.stringify(history))
      console.log('currentPosition',currentPosition)
      console.log('totalProfit',totalProfit)
    }
    setPageLoading(false)
  }

  useEffect(()=>{
    // getLongShortRatioData();
    // getSentiment();
    // getFee({ instrument_id : BTC_INSTRUMENT_ID });
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
      {/*<p>手续费率：*/}
      {/*  手续费档位: {feeObj.category} <Divider type='vertical' />*/}
      {/*  吃单手续费率: {feeObj.taker} <Divider type='vertical' />*/}
      {/*  挂单手续费率: {feeObj.maker} <Divider type='vertical' />*/}
      {/*  时间: {moment(feeObj.timestamp).format('YYYY-MM-DD HH:mm:ss')} <Divider type='vertical' />*/}
      {/*  /!*交割手续费率: {feeObj.delivery} <Divider type='vertical' />*!/*/}
      {/*</p>*/}
      {/*<Divider />*/}

      {/*frequency:*/}
      {/*<InputNumber*/}
      {/*  value={ frequency }*/}
      {/*  step={0.1}*/}
      {/*  min={0.1}*/}
      {/*  max={10}*/}
      {/*  onChange={v=>setFrequency(Number(v))}*/}
      {/*/>*/}

      {/*winRatio:*/}
      {/*<InputNumber*/}
      {/*  value={ changebleWinRatio }*/}
      {/*  step={0.1}*/}
      {/*  min={0.1}*/}
      {/*  max={10}*/}
      {/*  onChange={v=> {*/}
      {/*    setChangebleWinRatio(Number(v))*/}
      {/*    winRatio.current = (Number(v))*/}
      {/*  }}*/}
      {/*/>*/}

      {/*lossRatio:*/}
      {/*<InputNumber*/}
      {/*  value={ changebleLossRatio }*/}
      {/*  step={0.1}*/}
      {/*  min={0.1}*/}
      {/*  max={10}*/}
      {/*  onChange={v=> {*/}
      {/*    setChangebleLossRatio(Number(v))*/}
      {/*    lossRatio.current = (Number(v))*/}
      {/*  }}*/}
      {/*/>*/}

      {/*杠杆:*/}
      {/*<InputNumber*/}
      {/*  value={ leverage }*/}
      {/*  step={1}*/}
      {/*  min={1}*/}
      {/*  max={100}*/}
      {/*  onChange={v=>setLeverage(Number(v))}*/}
      {/*/>*/}

      月份：
      <Select value={month} onChange={v=>{setMonth(v);setDayStep(0)}} style={{ width: 120 }}>
        {
          monthMap.map(item=>{
            return  <Select.Option value={item} key={item}>{item}</Select.Option>
          })
        }
      </Select>

      <DatePicker onChange={(v,dateString)=>setDate(dateString)} style={{ marginLeft: 10 }}/>

      <Button onClick={()=>fnGetProfitByMonth()} type="primary" style={{ marginLeft: 10 }}>月总计</Button>

      <Button onClick={()=>fnGetProfitByDay()} type="primary" style={{ marginLeft: 10 }}>天总计</Button>

      <Button onClick={()=>fnGetLatestProfit()} style={{ marginLeft: 10 }}>最近总计</Button>

      <Button onClick={()=>fnGetHistoryByDay()} style={{ marginLeft: 10 }}>下载天历史数据</Button>

      <Button onClick={()=>fnGetHistoryByMonth()} style={{ marginLeft: 10 }}>下载月历史数据</Button>

      {/*<Button onClick={()=>fnReset()} style={{ marginLeft: 10 }}>重置</Button>*/}

      <Divider />

      {/*查询时长:*/}
      {/*<InputNumber*/}
      {/*  value={ duration }*/}
      {/*  step={1}*/}
      {/*  min={1}*/}
      {/*  max={12}*/}
      {/*  onChange={v=>setDuration(Number(v))}*/}
      {/*/>*/}
      {/*个月*/}
      {/*<Button onClick={()=>fnGetHistory()} type="primary" style={{ marginLeft: 10 }}>测算</Button>*/}
      {/*<Divider />*/}
      {/*历史数据范围：*/}
      {/*<RangePicker*/}
      {/*  showTime*/}
      {/*  showNow*/}
      {/*  onChange={fnGetHistory}*/}
      {/*  disabledDate={disabledDate}*/}
      {/*  defaultValue={[moment('2020-10-01 00:00:00','YYYY-MM-DD HH:mm:ss'),moment('2020-09-03 00:00:00','YYYY-MM-DD HH:mm:ss')]}*/}
      {/*/>*/}

      {/*<Divider />*/}

      {/*<p>总盈亏：{tPnl} </p>*/}
      <p>总盈亏比：{tPnlRatio}</p>

      {
        tPnlList.length && tPnlList.map((item,index)=>{
          return <div key={`${item.date}-${index}`}>
            <p>日期：{item.date}</p>
            <p>盈亏比：{item.profit}</p>
          </div>
        })
      }

    </Card>
    {/*<Card title={'BTC交易记录'} >*/}
    {/*  <SearchTable*/}
    {/*    columns={getColumns(pageSize)}*/}
    {/*    getList={initBTCData}*/}
    {/*    responseHandler={data=>responseHandler(data,current,pageSize)}*/}
    {/*    rowKey={"order_id"}*/}
    {/*    tableId={"btc"}*/}
    {/*    key={'btc'}*/}
    {/*    callbackPageSize={(cr,ps)=> {*/}
    {/*      setCurrent(cr)*/}
    {/*      setPageSize(ps)*/}
    {/*    }}*/}
    {/*  />*/}
    {/*</Card>*/}
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
