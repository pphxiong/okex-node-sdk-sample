(window["webpackJsonp"]=window["webpackJsonp"]||[]).push([[7],{KIUL:function(e,t,n){"use strict";n.r(t);n("P2fV");var a=n("NJEC"),r=(n("giR+"),n("fyUT")),l=(n("IzEo"),n("bx4M")),u=(n("/zsF"),n("PArb")),c=(n("14J3"),n("BMrR")),s=(n("jCWc"),n("kPKH")),i=(n("+L6B"),n("2/Rp")),o=(n("miYZ"),n("tsqr")),p=n("WmNS"),m=n.n(p),d=n("9og8"),E=n("tJVT"),b=n("q1tI"),f=n.n(b),v=n("t3Un"),h="/okex";function _(e){return g.apply(this,arguments)}function g(){return g=Object(d["a"])(m.a.mark((function e(t){return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.abrupt("return",Object(v["a"])("".concat(h,"/futures/postLeverage"),{params:t}));case 1:case"end":return e.stop()}}),e)}))),g.apply(this,arguments)}function O(e){return y.apply(this,arguments)}function y(){return y=Object(d["a"])(m.a.mark((function e(t){return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.abrupt("return",Object(v["a"])("".concat(h,"/futures/postOrder"),{params:t}));case 1:case"end":return e.stop()}}),e)}))),y.apply(this,arguments)}function w(e){return N.apply(this,arguments)}function N(){return N=Object(d["a"])(m.a.mark((function e(t){return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.abrupt("return",Object(v["a"])("".concat(h,"/futures/getPosition"),{params:t}));case 1:case"end":return e.stop()}}),e)}))),N.apply(this,arguments)}var S=n("wd/R"),j=n.n(S);t["default"]=function(e){var t=Object(b["useState"])(10),n=Object(E["a"])(t,2),p=n[0],v=n[1],h=Object(b["useState"])(5),g=Object(E["a"])(h,2),y=(g[0],g[1],Object(b["useState"])(1)),N=Object(E["a"])(y,2),S=N[0],x=N[1],C=Object(b["useState"])({}),k=Object(E["a"])(C,2),D=k[0],T=k[1],B=Object(b["useState"])({}),U=Object(E["a"])(B,2),Y=U[0],z=U[1],M=function(){var e=Object(d["a"])(m.a.mark((function e(){var t,n,a,r;return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.next=2,w({instrument_id:"BTC-USD-201225"});case 2:return a=e.sent,T(null===a||void 0===a||null===(t=a.data)||void 0===t?void 0:t.holding[0]),e.next=6,w({instrument_id:"EOS-USD-201225"});case 6:r=e.sent,z(null===r||void 0===r||null===(n=r.data)||void 0===n?void 0:n.holding[0]);case 8:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}();Object(b["useEffect"])((function(){M()}),[]);var I=function(){var e=Object(d["a"])(m.a.mark((function e(){var t,n;return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.next=2,_({underlying:"BTC-USD",leverage:p});case 2:t=e.sent,n=null===t||void 0===t?void 0:t.data,n&&o["b"].success("BTC\u6760\u6746\u8bbe\u7f6e\u6210\u529f"),setTimeout(Object(d["a"])(m.a.mark((function e(){var t,n;return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return e.next=2,_({underlying:"EOS-USD",leverage:p});case 2:t=e.sent,n=null===t||void 0===t?void 0:t.data,n&&o["b"].success("EOS\u6760\u6746\u8bbe\u7f6e\u6210\u529f");case 5:case"end":return e.stop()}}),e)}))),1e3);case 6:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}(),J=function(){var e=Object(d["a"])(m.a.mark((function e(){var t,n,a,r,l,u;return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return a={size:S,type:1,order_type:4,instrument_id:"BTC-USD-201225"},e.next=3,O(a);case 3:return r=e.sent,console.log(r),(null===r||void 0===r||null===(t=r.data)||void 0===t?void 0:t.result)&&o["b"].success("BTC\u5f00\u4ed3\u6210\u529f"),l={size:10*S,type:2,order_type:4,instrument_id:"EOS-USD-201225"},e.next=9,O(l);case 9:u=e.sent,console.log(u),(null===u||void 0===u||null===(n=u.data)||void 0===n?void 0:n.result)&&o["b"].success("EOS\u5f00\u4ed3\u6210\u529f");case 12:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}(),L=function(){var e=Object(d["a"])(m.a.mark((function e(){var t,n,a,r,l,u;return m.a.wrap((function(e){while(1)switch(e.prev=e.next){case 0:return a={size:S,type:3,order_type:4,instrument_id:"BTC-USD-201225"},e.next=3,O(a);case 3:return r=e.sent,console.log(r),(null===r||void 0===r||null===(t=r.data)||void 0===t?void 0:t.result)&&o["b"].success("BTC\u5e73\u4ed3\u6210\u529f"),l={size:10*S,type:4,order_type:4,instrument_id:"EOS-USD-201225"},e.next=9,O(l);case 9:u=e.sent,console.log(u),(null===u||void 0===u||null===(n=u.data)||void 0===n?void 0:n.result)&&o["b"].success("EOS\u5e73\u4ed3\u6210\u529f");case 12:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}();return f.a.createElement(f.a.Fragment,null,f.a.createElement(l["a"],{title:"\u6301\u4ed3\u60c5\u51b5",extra:f.a.createElement(i["a"],{onClick:function(){return M()}},"\u5237\u65b0")},f.a.createElement(c["a"],{gutter:12},f.a.createElement(s["a"],{span:12},f.a.createElement("h3",null,"BTC"),f.a.createElement("p",null,"ID\uff1a",D.instrument_id),f.a.createElement("p",null,"\u66f4\u65b0\u65f6\u95f4\uff1a",j()(D.updated_at).format("YYYY-MM-DD hh:mm:ss")),f.a.createElement("p",null,"\u6760\u6746\u500d\u6570\uff1a",D.leverage),f.a.createElement("p",null,"\u6570\u91cf\uff08\u5f20\uff09\uff1a",D.long_qty),f.a.createElement("p",null,"\u5f00\u4ed3\u5747\u4ef7\uff1a",D.long_avg_cost),f.a.createElement("p",null,"\u6700\u65b0\u6210\u4ea4\u4ef7\uff08\u7f8e\u5143\uff09\uff1a",D.last),f.a.createElement("p",null,"\u591a\u4ed3\u4fdd\u8bc1\u91d1(BTC)\uff1a",D.long_margin),f.a.createElement("p",null,"\u591a\u4ed3\u6536\u76ca(BTC)\uff1a",D.long_pnl),f.a.createElement("p",null,"\u591a\u4ed3\u6536\u76ca\u7387\uff08%\uff09\uff1a",100*Number(D.long_pnl_ratio)),f.a.createElement("p",null,"\u5df2\u5b9e\u73b0\u76c8\u4f59\uff1a",D.realised_pnl),f.a.createElement("p",null,"\u6536\u76ca\u6298\u5408\uff08\u7f8e\u5143\uff09\uff1a",Number(D.long_pnl)*Number(D.last)),f.a.createElement("p",null,"\u5df2\u5b9e\u73b0\u76c8\u4f59\u6298\u5408\uff08\u7f8e\u5143\uff09\uff1a",Number(D.realised_pnl)*Number(D.last))),f.a.createElement(s["a"],{span:12},f.a.createElement("h3",null,"EOS"),f.a.createElement("p",null,"ID\uff1a",Y.instrument_id),f.a.createElement("p",null,"\u66f4\u65b0\u65f6\u95f4\uff1a",j()(Y.updated_at).format("YYYY-MM-DD hh:mm:ss")),f.a.createElement("p",null,"\u6760\u6746\u500d\u6570\uff1a",Y.leverage),f.a.createElement("p",null,"\u6570\u91cf\uff08\u5f20\uff09\uff1a",Y.short_qty),f.a.createElement("p",null,"\u5f00\u4ed3\u5747\u4ef7\uff1a",Y.short_avg_cost),f.a.createElement("p",null,"\u6700\u65b0\u6210\u4ea4\u4ef7\uff08\u7f8e\u5143\uff09\uff1a",Y.last),f.a.createElement("p",null,"\u7a7a\u4ed3\u4fdd\u8bc1\u91d1\uff08EOS)\uff1a",Y.short_margin),f.a.createElement("p",null,"\u7a7a\u4ed3\u6536\u76ca\uff08EOS)\uff1a",Y.short_pnl),f.a.createElement("p",null,"\u7a7a\u4ed3\u6536\u76ca\u7387\uff08%\uff09\uff1a",100*Number(Y.short_pnl_ratio)),f.a.createElement("p",null,"\u5df2\u5b9e\u73b0\u76c8\u4f59\uff1a",Y.realised_pnl),f.a.createElement("p",null,"\u6536\u76ca\u6298\u5408\uff08\u7f8e\u5143\uff09\uff1a",Number(Y.short_pnl)*Number(Y.last)),f.a.createElement("p",null,"\u5df2\u5b9e\u73b0\u76c8\u4f59\u6298\u5408\uff08\u7f8e\u5143\uff09\uff1a",Number(Y.realised_pnl)*Number(Y.last)))),f.a.createElement(u["a"],null),f.a.createElement(c["a"],null,f.a.createElement(s["a"],{span:24},f.a.createElement("h3",null,"\u5171\u8ba1"),f.a.createElement("p",null,"\u6536\u76ca\uff08\u7f8e\u5143\uff09\uff1a",Number(D.long_pnl)*Number(D.last)+Number(Y.short_pnl)*Number(Y.last)),f.a.createElement("p",null,"\u6536\u76ca\u7387\uff08%\uff09\uff1a",100*(Number(D.long_pnl)*Number(D.last)+Number(Y.short_pnl)*Number(Y.last))/(Number(D.long_margin)*Number(D.last)+Number(Y.short_margin)*Number(Y.last))),f.a.createElement("p",null,"\u5df2\u5b9e\u73b0\u76c8\u4f59\uff08\u7f8e\u5143\uff09\uff1a",Number(D.realised_pnl)*Number(D.last)+Number(Y.realised_pnl)*Number(Y.last))))),f.a.createElement(l["a"],{title:"\u4ea4\u5272\u5408\u7ea6",style:{marginTop:10}},f.a.createElement("span",null,"\u8bbe\u7f6e\u6760\u6746\u500d\u6570\uff1a"),f.a.createElement(r["a"],{value:p,step:1,onChange:function(e){return v(e)}}),f.a.createElement(u["a"],{type:"vertical"}),f.a.createElement("span",null,"\u5f00\u4ed3\u5f20\u6570\uff1a"),f.a.createElement(r["a"],{value:S,step:1,onChange:function(e){return x(e)}}),f.a.createElement(i["a"],{onClick:function(){return I()},type:"primary",style:{marginLeft:10}},"\u786e\u5b9a"),f.a.createElement(u["a"],{type:"horizontal"}),f.a.createElement(a["a"],{title:"\u662f\u5426\u786e\u5b9a\u4ee5\u5e02\u4ef7\u5f00\u4ed3\uff1f",onConfirm:function(){return J()}},f.a.createElement(i["a"],null,"\u5bf9\u51b2\u5f00\u4ed3")),f.a.createElement(a["a"],{title:"\u662f\u5426\u786e\u5b9a\u8981\u5168\u90e8\u5e73\u4ed3\uff1f",onConfirm:function(){return L()}},f.a.createElement(i["a"],{type:"primary",style:{marginLeft:10}},"\u5168\u5e73"))))}}}]);