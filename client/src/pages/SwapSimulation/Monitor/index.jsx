import React, { useState, useEffect, useRef } from 'react';
import { Card, Divider, Button, DatePicker, InputNumber, Select, Spin, message, Row, Col } from 'antd';
import SearchTable, { refreshTable } from '@/components/SearchTable';
import moment from "moment";
import { Line } from '@ant-design/charts';
import {
  startHearBeat,
  reset,
  setRSIParams,
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
  const [year,setYear] = useState('2021');
  const [interval,setInterval] = useState('3m');
  const [latestInterval,setLatestInterval] = useState(20);
  const [rsi1,setRsi1] = useState(6);
  const [rsi2,setRsi2] = useState(12);
  const [rsi3,setRsi3] = useState(24);
  const [leverage,setLeverage] = useState(10);
  const [duration,setDuration] = useState(11);
  const [dayStep, setDayStep] = useState(0);
  const [date,setDate] = useState("");

  const yearMap = ['2020','2021']
  const intervalMap = ['1m','3m','5m','15m','30m']
  const latestIntervalMap = [10, 20, 40, 80, 240, 480, 960, 1440]
  const monthMap = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const dayMonthMap = {
    '01': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '02': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28'],
    '03': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '04': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '05': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '06': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '07': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '08': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '09': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '10': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '11': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
    '12': ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'],
  }

  const fnReset = async () => {
    const { errmsg } = await reset();
    message.info(errmsg)
  }

  const fnGetLatestProfit = async () => {
    setPageLoading(true)
    const time = moment().valueOf();
    const payload = { time, interval, limit: latestInterval }
    const { data } = await getLatestProfit(payload)
    if(data){
      const { totalProfit, dealDetailList, mostLoss } = data;
      const date = moment(time).format('YYYY-MM-DD hh:mm:ss')
      const profitList = [];
      const dayProfit = {
        profit: totalProfit,
        date,
        dealDetailList,
        mostLoss
      }
      profitList.push(dayProfit);
      setTPnlList(profitList);
      let tProfit = 0;
      profitList.map(item=>{ tProfit += item.profit });
      setTPnlRatio(tProfit)
    }
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

  const fnSetRSI = async () => {
    const payload = { rsi1, rsi2, rsi3 };
    const { errmsg } = await setRSIParams(payload);
    message.success(errmsg)
  }

  const fnGetHistoryByMonth = async () => {
    if(!month) {
      message.warning('请先选择月份');
      return;
    }
    const dayList = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20',
      '21','22','23','24','25','26','27','28','29','30'];

    const yearAndMonth = `${year}-${month}`

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

  const fnGetProfitByYear = async () => {
    try{
      setPageLoading(true);

      let y = 0;
      const yProfitList = [];

      const yP = new Promise(async resolveP => {
        const fnGetM = async m => {
          const dayList = dayMonthMap[m];

          const profitList = []
          const yearAndMonth = `${year}-${m}`;
          let i = 0;
          const p = new Promise(async resolve => {
            const getDayData = async date => {
              const time = moment(`${date} 00:00:00`).valueOf()
              const limit = 60 * 24 / Number(interval.split('m')[0])
              const payload = { date, time, interval, limit, isAutoReset: false }
              const { data } = await startHearBeat(payload);
              if(data){
                const { dealDetailList, totalProfit, mostLoss } = data;
                const dayProfit = {
                  profit: totalProfit,
                  date,
                  // dealDetailList,
                  // mostLoss
                }
                profitList.push(dayProfit);

                i++;
                if(i >= dayList.length || totalProfit == 0){
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

          p.then(async data=>{
            let tProfit = 0;
            data.map(item=>{ tProfit += item.profit });

            yProfitList.push({
              date: monthMap[y],
              profit: tProfit
            })

            y++;
            if(y >= monthMap.length || tProfit == 0){
              resolveP(yProfitList);
              return;
            }
            await fnGetM(monthMap[y]);
          })
        }
        await fnGetM(monthMap[y]);
      })

      yP.then(data=>{
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

  const fnGetProfitByMonth = async () => {
    try{
      setPageLoading(true);
      const dayList = dayMonthMap[month];

      const profitList = []
      const yearAndMonth = `${year}-${month}`;
      let i = 0;
      const p = new Promise(async resolve => {
        const getDayData = async date => {
          const time = moment(`${date} 00:00:00`).valueOf()
          const limit = 60 * 24 / Number(interval.split('m')[0])
          const payload = { date, time, interval, limit, isAutoReset: false }
          const { data } = await startHearBeat(payload);
          if(data){
            const { dealDetailList, totalProfit, mostLoss } = data;
            const dayProfit = {
              profit: totalProfit,
              date,
              dealDetailList,
              mostLoss
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
    const time = moment(`${date} 00:00:00`).valueOf()
    const limit = 60 * 24 / Number(interval.split('m')[0])
    const payload = { date, time, limit }
    const { data } = await startHearBeat(payload)
    if(data){
      const { totalProfit, dealDetailList, mostLoss } = data;
      const profitList = [];
      const dayProfit = {
        profit: totalProfit,
        date,
        dealDetailList,
        mostLoss
      }
      profitList.push(dayProfit);
      setTPnlList(profitList);
      let tProfit = 0;
      profitList.map(item=>{ tProfit += item.profit });
      setTPnlRatio(tProfit)
    }
    setPageLoading(false)
  }

  useEffect(()=>{

  },[])

  return <Spin spinning={pageLoading}>
    <Card title='概况'>
      <Row>
        年份：
        <Select value={year} onChange={v=>{setYear(v);}} style={{ width: 120 }}>
          {
            yearMap.map(item=>{
              return  <Select.Option value={item} key={item}>{item}</Select.Option>
            })
          }
        </Select>

        月份：
        <Select value={month} onChange={v=>{setMonth(v);setDayStep(0)}} style={{ width: 120 }}>
          {
            monthMap.map(item=>{
              return  <Select.Option value={item} key={item}>{item}</Select.Option>
            })
          }
        </Select>

        <DatePicker onChange={(v,dateString)=>setDate(dateString)} style={{ marginLeft: 10 }}/>

        间隔：
        <Select value={interval} onChange={v=>{setInterval(v);}} style={{ width: 120 }}>
          {
            intervalMap.map(item=>{
              return  <Select.Option value={item} key={item}>{item}</Select.Option>
            })
          }
        </Select>
        <Button onClick={()=>fnGetHistoryByDay()} style={{ marginLeft: 10 }}>下载天历史数据</Button>

        <Button onClick={()=>fnGetHistoryByMonth()} style={{ marginLeft: 10 }}>下载月历史数据</Button>

      </Row>

      <Row style={{ marginTop: 10 }} gutter={12}>
        <Col>
          RSI1: <InputNumber step={1} value={rsi1} onChange={v=>setRsi1(v)} />
          RSI2: <InputNumber step={1} value={rsi2} onChange={v=>setRsi2(v)} />
          RSI3: <InputNumber step={1} value={rsi3} onChange={v=>setRsi3(v)} />
          <Button onClick={()=>fnSetRSI()} style={{ marginLeft: 10 }}>RSI设置</Button>
        </Col>
        <Col>
          <Button onClick={()=>fnGetProfitByMonth()} type="primary" style={{ marginLeft: 10 }}>月总计</Button>

          <Button onClick={()=>fnGetProfitByDay()} type="primary" style={{ marginLeft: 10 }}>天总计</Button>

          <Button onClick={()=>fnGetProfitByYear()} style={{ marginLeft: 10 }}>年总计</Button>

          <Select value={latestInterval} onChange={v=>{setLatestInterval(v);}} style={{ width: 120, marginLeft: 10 }}>
            {
              latestIntervalMap.map(item=>{
                return  <Select.Option value={item} key={item}>{item}</Select.Option>
              })
            }
          </Select>

          <Button onClick={()=>fnGetLatestProfit()} style={{ marginLeft: 10 }}>最近总计</Button>
        </Col>

      </Row>


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
            <p>最大亏损：{item.mostLoss && item.mostLoss.profit} {item.mostLoss && item.mostLoss.time}</p>
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
