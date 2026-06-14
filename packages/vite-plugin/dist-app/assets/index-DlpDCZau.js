(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))o(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&o(i)}).observe(document,{childList:!0,subtree:!0});function n(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function o(s){if(s.ep)return;s.ep=!0;const r=n(s);fetch(s.href,r)}})();var j,h,ke,S,ae,we,Ce,K,F,M,Se,te,G,Q,U={},O=[],Oe=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,q=Array.isArray;function w(t,e){for(var n in e)t[n]=e[n];return t}function ne(t){t&&t.parentNode&&t.parentNode.removeChild(t)}function re(t,e,n){var o,s,r,i={};for(r in e)r=="key"?o=e[r]:r=="ref"?s=e[r]:i[r]=e[r];if(arguments.length>2&&(i.children=arguments.length>3?j.call(arguments,2):n),typeof t=="function"&&t.defaultProps!=null)for(r in t.defaultProps)i[r]===void 0&&(i[r]=t.defaultProps[r]);return I(t,i,o,s,null)}function I(t,e,n,o,s){var r={type:t,props:e,key:n,ref:o,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:s??++ke,__i:-1,__u:0};return s==null&&h.vnode!=null&&h.vnode(r),r}function B(t){return t.children}function A(t,e){this.props=t,this.context=e}function N(t,e){if(e==null)return t.__?N(t.__,t.__i+1):null;for(var n;e<t.__k.length;e++)if((n=t.__k[e])!=null&&n.__e!=null)return n.__e;return typeof t.type=="function"?N(t):null}function Re(t){if(t.__P&&t.__d){var e=t.__v,n=e.__e,o=[],s=[],r=w({},e);r.__v=e.__v+1,h.vnode&&h.vnode(r),oe(t.__P,r,e,t.__n,t.__P.namespaceURI,32&e.__u?[n]:null,o,n??N(e),!!(32&e.__u),s),r.__v=e.__v,r.__.__k[r.__i]=r,He(o,r,s),e.__e=e.__=null,r.__e!=n&&Te(r)}}function Te(t){if((t=t.__)!=null&&t.__c!=null)return t.__e=t.__c.base=null,t.__k.some(function(e){if(e!=null&&e.__e!=null)return t.__e=t.__c.base=e.__e}),Te(t)}function le(t){(!t.__d&&(t.__d=!0)&&S.push(t)&&!R.__r++||ae!=h.debounceRendering)&&((ae=h.debounceRendering)||we)(R)}function R(){try{for(var t,e=1;S.length;)S.length>e&&S.sort(Ce),t=S.shift(),e=S.length,Re(t)}finally{S.length=R.__r=0}}function Pe(t,e,n,o,s,r,i,_,c,l,p){var a,u,d,b,$,y,f,m=o&&o.__k||O,C=e.length;for(c=We(n,e,m,c,C),a=0;a<C;a++)(d=n.__k[a])!=null&&(u=d.__i!=-1&&m[d.__i]||U,d.__i=a,y=oe(t,d,u,s,r,i,_,c,l,p),b=d.__e,d.ref&&u.ref!=d.ref&&(u.ref&&se(u.ref,null,d),p.push(d.ref,d.__c||b,d)),$==null&&b!=null&&($=b),(f=!!(4&d.__u))||u.__k===d.__k?(c=Ne(d,c,t,f),f&&u.__e&&(u.__e=null)):typeof d.type=="function"&&y!==void 0?c=y:b&&(c=b.nextSibling),d.__u&=-7);return n.__e=$,c}function We(t,e,n,o,s){var r,i,_,c,l,p=n.length,a=p,u=0;for(t.__k=new Array(s),r=0;r<s;r++)(i=e[r])!=null&&typeof i!="boolean"&&typeof i!="function"?(typeof i=="string"||typeof i=="number"||typeof i=="bigint"||i.constructor==String?i=t.__k[r]=I(null,i,null,null,null):q(i)?i=t.__k[r]=I(B,{children:i},null,null,null):i.constructor===void 0&&i.__b>0?i=t.__k[r]=I(i.type,i.props,i.key,i.ref?i.ref:null,i.__v):t.__k[r]=i,c=r+u,i.__=t,i.__b=t.__b+1,_=null,(l=i.__i=je(i,n,c,a))!=-1&&(a--,(_=n[l])&&(_.__u|=2)),_==null||_.__v==null?(l==-1&&(s>p?u--:s<p&&u++),typeof i.type!="function"&&(i.__u|=4)):l!=c&&(l==c-1?u--:l==c+1?u++:(l>c?u--:u++,i.__u|=4))):t.__k[r]=null;if(a)for(r=0;r<p;r++)(_=n[r])!=null&&(2&_.__u)==0&&(_.__e==o&&(o=N(_)),ze(_,_));return o}function Ne(t,e,n,o){var s,r;if(typeof t.type=="function"){for(s=t.__k,r=0;s&&r<s.length;r++)s[r]&&(s[r].__=t,e=Ne(s[r],e,n,o));return e}t.__e!=e&&(o&&(e&&t.type&&!e.parentNode&&(e=N(t)),n.insertBefore(t.__e,e||null)),e=t.__e);do e=e&&e.nextSibling;while(e!=null&&e.nodeType==8);return e}function je(t,e,n,o){var s,r,i,_=t.key,c=t.type,l=e[n],p=l!=null&&(2&l.__u)==0;if(l===null&&_==null||p&&_==l.key&&c==l.type)return n;if(o>(p?1:0)){for(s=n-1,r=n+1;s>=0||r<e.length;)if((l=e[i=s>=0?s--:r++])!=null&&(2&l.__u)==0&&_==l.key&&c==l.type)return i}return-1}function _e(t,e,n){e[0]=="-"?t.setProperty(e,n??""):t[e]=n==null?"":typeof n!="number"||Oe.test(e)?n:n+"px"}function D(t,e,n,o,s){var r,i;e:if(e=="style")if(typeof n=="string")t.style.cssText=n;else{if(typeof o=="string"&&(t.style.cssText=o=""),o)for(e in o)n&&e in n||_e(t.style,e,"");if(n)for(e in n)o&&n[e]==o[e]||_e(t.style,e,n[e])}else if(e[0]=="o"&&e[1]=="n")r=e!=(e=e.replace(Se,"$1")),i=e.toLowerCase(),e=i in t||e=="onFocusOut"||e=="onFocusIn"?i.slice(2):e.slice(2),t.l||(t.l={}),t.l[e+r]=n,n?o?n[M]=o[M]:(n[M]=te,t.addEventListener(e,r?Q:G,r)):t.removeEventListener(e,r?Q:G,r);else{if(s=="http://www.w3.org/2000/svg")e=e.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(e!="width"&&e!="height"&&e!="href"&&e!="list"&&e!="form"&&e!="tabIndex"&&e!="download"&&e!="rowSpan"&&e!="colSpan"&&e!="role"&&e!="popover"&&e in t)try{t[e]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&e[4]!="-"?t.removeAttribute(e):t.setAttribute(e,e=="popover"&&n==1?"":n))}}function ce(t){return function(e){if(this.l){var n=this.l[e.type+t];if(e[F]==null)e[F]=te++;else if(e[F]<n[M])return;return n(h.event?h.event(e):e)}}}function oe(t,e,n,o,s,r,i,_,c,l){var p,a,u,d,b,$,y,f,m,C,T,H,ie,z,J,k=e.type;if(e.constructor!==void 0)return null;128&n.__u&&(c=!!(32&n.__u),r=[_=e.__e=n.__e]),(p=h.__b)&&p(e);e:if(typeof k=="function")try{if(f=e.props,m=k.prototype&&k.prototype.render,C=(p=k.contextType)&&o[p.__c],T=p?C?C.props.value:p.__:o,n.__c?y=(a=e.__c=n.__c).__=a.__E:(m?e.__c=a=new k(f,T):(e.__c=a=new A(f,T),a.constructor=k,a.render=Be),C&&C.sub(a),a.state||(a.state={}),a.__n=o,u=a.__d=!0,a.__h=[],a._sb=[]),m&&a.__s==null&&(a.__s=a.state),m&&k.getDerivedStateFromProps!=null&&(a.__s==a.state&&(a.__s=w({},a.__s)),w(a.__s,k.getDerivedStateFromProps(f,a.__s))),d=a.props,b=a.state,a.__v=e,u)m&&k.getDerivedStateFromProps==null&&a.componentWillMount!=null&&a.componentWillMount(),m&&a.componentDidMount!=null&&a.__h.push(a.componentDidMount);else{if(m&&k.getDerivedStateFromProps==null&&f!==d&&a.componentWillReceiveProps!=null&&a.componentWillReceiveProps(f,T),e.__v==n.__v||!a.__e&&a.shouldComponentUpdate!=null&&a.shouldComponentUpdate(f,a.__s,T)===!1){e.__v!=n.__v&&(a.props=f,a.state=a.__s,a.__d=!1),e.__e=n.__e,e.__k=n.__k,e.__k.some(function(P){P&&(P.__=e)}),O.push.apply(a.__h,a._sb),a._sb=[],a.__h.length&&i.push(a);break e}a.componentWillUpdate!=null&&a.componentWillUpdate(f,a.__s,T),m&&a.componentDidUpdate!=null&&a.__h.push(function(){a.componentDidUpdate(d,b,$)})}if(a.context=T,a.props=f,a.__P=t,a.__e=!1,H=h.__r,ie=0,m)a.state=a.__s,a.__d=!1,H&&H(e),p=a.render(a.props,a.state,a.context),O.push.apply(a.__h,a._sb),a._sb=[];else do a.__d=!1,H&&H(e),p=a.render(a.props,a.state,a.context),a.state=a.__s;while(a.__d&&++ie<25);a.state=a.__s,a.getChildContext!=null&&(o=w(w({},o),a.getChildContext())),m&&!u&&a.getSnapshotBeforeUpdate!=null&&($=a.getSnapshotBeforeUpdate(d,b)),z=p!=null&&p.type===B&&p.key==null?Me(p.props.children):p,_=Pe(t,q(z)?z:[z],e,n,o,s,r,i,_,c,l),a.base=e.__e,e.__u&=-161,a.__h.length&&i.push(a),y&&(a.__E=a.__=null)}catch(P){if(e.__v=null,c||r!=null)if(P.then){for(e.__u|=c?160:128;_&&_.nodeType==8&&_.nextSibling;)_=_.nextSibling;r[r.indexOf(_)]=null,e.__e=_}else{for(J=r.length;J--;)ne(r[J]);Y(e)}else e.__e=n.__e,e.__k=n.__k,P.then||Y(e);h.__e(P,e,n)}else r==null&&e.__v==n.__v?(e.__k=n.__k,e.__e=n.__e):_=e.__e=qe(n.__e,e,n,o,s,r,i,c,l);return(p=h.diffed)&&p(e),128&e.__u?void 0:_}function Y(t){t&&(t.__c&&(t.__c.__e=!0),t.__k&&t.__k.some(Y))}function He(t,e,n){for(var o=0;o<n.length;o++)se(n[o],n[++o],n[++o]);h.__c&&h.__c(e,t),t.some(function(s){try{t=s.__h,s.__h=[],t.some(function(r){r.call(s)})}catch(r){h.__e(r,s.__v)}})}function Me(t){return typeof t!="object"||t==null||t.__b>0?t:q(t)?t.map(Me):w({},t)}function qe(t,e,n,o,s,r,i,_,c){var l,p,a,u,d,b,$,y=n.props||U,f=e.props,m=e.type;if(m=="svg"?s="http://www.w3.org/2000/svg":m=="math"?s="http://www.w3.org/1998/Math/MathML":s||(s="http://www.w3.org/1999/xhtml"),r!=null){for(l=0;l<r.length;l++)if((d=r[l])&&"setAttribute"in d==!!m&&(m?d.localName==m:d.nodeType==3)){t=d,r[l]=null;break}}if(t==null){if(m==null)return document.createTextNode(f);t=document.createElementNS(s,m,f.is&&f),_&&(h.__m&&h.__m(e,r),_=!1),r=null}if(m==null)y===f||_&&t.data==f||(t.data=f);else{if(r=r&&j.call(t.childNodes),!_&&r!=null)for(y={},l=0;l<t.attributes.length;l++)y[(d=t.attributes[l]).name]=d.value;for(l in y)d=y[l],l=="dangerouslySetInnerHTML"?a=d:l=="children"||l in f||l=="value"&&"defaultValue"in f||l=="checked"&&"defaultChecked"in f||D(t,l,null,d,s);for(l in f)d=f[l],l=="children"?u=d:l=="dangerouslySetInnerHTML"?p=d:l=="value"?b=d:l=="checked"?$=d:_&&typeof d!="function"||y[l]===d||D(t,l,d,y[l],s);if(p)_||a&&(p.__html==a.__html||p.__html==t.innerHTML)||(t.innerHTML=p.__html),e.__k=[];else if(a&&(t.innerHTML=""),Pe(e.type=="template"?t.content:t,q(u)?u:[u],e,n,o,m=="foreignObject"?"http://www.w3.org/1999/xhtml":s,r,i,r?r[0]:n.__k&&N(n,0),_,c),r!=null)for(l=r.length;l--;)ne(r[l]);_||(l="value",m=="progress"&&b==null?t.removeAttribute("value"):b!=null&&(b!==t[l]||m=="progress"&&!b||m=="option"&&b!=y[l])&&D(t,l,b,y[l],s),l="checked",$!=null&&$!=t[l]&&D(t,l,$,y[l],s))}return t}function se(t,e,n){try{if(typeof t=="function"){var o=typeof t.__u=="function";o&&t.__u(),o&&e==null||(t.__u=t(e))}else t.current=e}catch(s){h.__e(s,n)}}function ze(t,e,n){var o,s;if(h.unmount&&h.unmount(t),(o=t.ref)&&(o.current&&o.current!=t.__e||se(o,null,e)),(o=t.__c)!=null){if(o.componentWillUnmount)try{o.componentWillUnmount()}catch(r){h.__e(r,e)}o.base=o.__P=null}if(o=t.__k)for(s=0;s<o.length;s++)o[s]&&ze(o[s],e,n||typeof t.type!="function");n||ne(t.__e),t.__c=t.__=t.__e=void 0}function Be(t,e,n){return this.constructor(t,n)}function ue(t,e,n){var o,s,r,i;e==document&&(e=document.documentElement),h.__&&h.__(t,e),s=(o=!1)?null:e.__k,r=[],i=[],oe(e,t=e.__k=re(B,null,[t]),s||U,U,e.namespaceURI,s?null:e.firstChild?j.call(e.childNodes):null,r,s?s.__e:e.firstChild,o,i),He(r,t,i)}j=O.slice,h={__e:function(t,e,n,o){for(var s,r,i;e=e.__;)if((s=e.__c)&&!s.__)try{if((r=s.constructor)&&r.getDerivedStateFromError!=null&&(s.setState(r.getDerivedStateFromError(t)),i=s.__d),s.componentDidCatch!=null&&(s.componentDidCatch(t,o||{}),i=s.__d),i)return s.__E=s}catch(_){t=_}throw t}},ke=0,A.prototype.setState=function(t,e){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=w({},this.state),typeof t=="function"&&(t=t(w({},n),this.props)),t&&w(n,t),t!=null&&this.__v&&(e&&this._sb.push(e),le(this))},A.prototype.forceUpdate=function(t){this.__v&&(this.__e=!0,t&&this.__h.push(t),le(this))},A.prototype.render=B,S=[],we=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ce=function(t,e){return t.__v.__b-e.__v.__b},R.__r=0,K=Math.random().toString(8),F="__d"+K,M="__a"+K,Se=/(PointerCapture)$|Capture$/i,te=0,G=ce(!1),Q=ce(!0);var W,g,V,pe,X=0,De=[],v=h,de=v.__b,fe=v.__r,me=v.diffed,he=v.__c,ge=v.unmount,ve=v.__;function Ee(t,e){v.__h&&v.__h(g,t,X||e),X=0;var n=g.__H||(g.__H={__:[],__h:[]});return t>=n.__.length&&n.__.push({}),n.__[t]}function Z(t){return X=1,Fe(Ae,t)}function Fe(t,e,n){var o=Ee(W++,2);if(o.t=t,!o.__c&&(o.__=[n?n(e):Ae(void 0,e),function(_){var c=o.__N?o.__N[0]:o.__[0],l=o.t(c,_);c!==l&&(o.__N=[l,o.__[1]],o.__c.setState({}))}],o.__c=g,!g.__f)){var s=function(_,c,l){if(!o.__c.__H)return!0;var p=o.__c.__H.__.filter(function(u){return u.__c});if(p.every(function(u){return!u.__N}))return!r||r.call(this,_,c,l);var a=o.__c.props!==_;return p.some(function(u){if(u.__N){var d=u.__[0];u.__=u.__N,u.__N=void 0,d!==u.__[0]&&(a=!0)}}),r&&r.call(this,_,c,l)||a};g.__f=!0;var r=g.shouldComponentUpdate,i=g.componentWillUpdate;g.componentWillUpdate=function(_,c,l){if(this.__e){var p=r;r=void 0,s(_,c,l),r=p}i&&i.call(this,_,c,l)},g.shouldComponentUpdate=s}return o.__N||o.__}function Ie(t,e){var n=Ee(W++,3);!v.__s&&Ve(n.__H,e)&&(n.__=t,n.u=e,g.__H.__h.push(n))}function Je(){for(var t;t=De.shift();){var e=t.__H;if(t.__P&&e)try{e.__h.some(L),e.__h.some(ee),e.__h=[]}catch(n){e.__h=[],v.__e(n,t.__v)}}}v.__b=function(t){g=null,de&&de(t)},v.__=function(t,e){t&&e.__k&&e.__k.__m&&(t.__m=e.__k.__m),ve&&ve(t,e)},v.__r=function(t){fe&&fe(t),W=0;var e=(g=t.__c).__H;e&&(V===g?(e.__h=[],g.__h=[],e.__.some(function(n){n.__N&&(n.__=n.__N),n.u=n.__N=void 0})):(e.__h.some(L),e.__h.some(ee),e.__h=[],W=0)),V=g},v.diffed=function(t){me&&me(t);var e=t.__c;e&&e.__H&&(e.__H.__h.length&&(De.push(e)!==1&&pe===v.requestAnimationFrame||((pe=v.requestAnimationFrame)||Ke)(Je)),e.__H.__.some(function(n){n.u&&(n.__H=n.u),n.u=void 0})),V=g=null},v.__c=function(t,e){e.some(function(n){try{n.__h.some(L),n.__h=n.__h.filter(function(o){return!o.__||ee(o)})}catch(o){e.some(function(s){s.__h&&(s.__h=[])}),e=[],v.__e(o,n.__v)}}),he&&he(t,e)},v.unmount=function(t){ge&&ge(t);var e,n=t.__c;n&&n.__H&&(n.__H.__.some(function(o){try{L(o)}catch(s){e=s}}),n.__H=void 0,e&&v.__e(e,n.__v))};var be=typeof requestAnimationFrame=="function";function Ke(t){var e,n=function(){clearTimeout(o),be&&cancelAnimationFrame(e),setTimeout(t)},o=setTimeout(n,35);be&&(e=requestAnimationFrame(n))}function L(t){var e=g,n=t.__c;typeof n=="function"&&(t.__c=void 0,n()),g=e}function ee(t){var e=g;t.__c=t.__(),g=e}function Ve(t,e){return!t||t.length!==e.length||e.some(function(n,o){return n!==t[o]})}function Ae(t,e){return typeof e=="function"?e(t):e}var Le=function(t,e,n,o){var s;e[0]=0;for(var r=1;r<e.length;r++){var i=e[r++],_=e[r]?(e[0]|=i?1:2,n[e[r++]]):e[++r];i===3?o[0]=_:i===4?o[1]=Object.assign(o[1]||{},_):i===5?(o[1]=o[1]||{})[e[++r]]=_:i===6?o[1][e[++r]]+=_+"":i?(s=t.apply(_,Le(t,_,n,["",null])),o.push(s),_[0]?e[0]|=2:(e[r-2]=0,e[r]=s)):o.push(_)}return o},ye=new Map;function Ge(t){var e=ye.get(this);return e||(e=new Map,ye.set(this,e)),(e=Le(this,e.get(t)||(e.set(t,e=(function(n){for(var o,s,r=1,i="",_="",c=[0],l=function(u){r===1&&(u||(i=i.replace(/^\s*\n\s*|\s*\n\s*$/g,"")))?c.push(0,u,i):r===3&&(u||i)?(c.push(3,u,i),r=2):r===2&&i==="..."&&u?c.push(4,u,0):r===2&&i&&!u?c.push(5,0,!0,i):r>=5&&((i||!u&&r===5)&&(c.push(r,0,i,s),r=6),u&&(c.push(r,u,0,s),r=6)),i=""},p=0;p<n.length;p++){p&&(r===1&&l(),l(p));for(var a=0;a<n[p].length;a++)o=n[p][a],r===1?o==="<"?(l(),c=[c],r=3):i+=o:r===4?i==="--"&&o===">"?(r=1,i=""):i=o+i[0]:_?o===_?_="":i+=o:o==='"'||o==="'"?_=o:o===">"?(l(),r=1):r&&(o==="="?(r=5,s=i,i=""):o==="/"&&(r<5||n[p][a+1]===">")?(l(),r===3&&(c=c[0]),r=c,(c=c[0]).push(2,0,r),r=0):o===" "||o==="	"||o===`
`||o==="\r"?(l(),r=2):i+=o),r===3&&i==="!--"&&(r=4,c=c[0])}return l(),c})(t)),e),arguments,[])).length>1?e:e[0]}function Ue(){return{scenes:[],currentSceneIndex:null,runStartTime:null,passCount:0,failCount:0,sceneCount:0,teams:[],running:!1,endDurationMs:null,connection:"connecting"}}function Qe(t){return{...t,actors:t.actors.slice(),lanes:t.lanes.map(e=>({actor:e.actor,items:e.items.slice()})),assertions:t.assertions.slice()}}function Ye(t,e){let n=t.lanes.find(o=>o.actor===e);return n||(n={actor:e,items:[]},t.lanes.push(n),t.actors.includes(e)||t.actors.push(e)),n}function Xe(t,e){var n,o,s,r;switch(e.type){case"run:start":return{...Ue(),connection:t.connection,runStartTime:e.timestamp,sceneCount:e.sceneCount,running:!0};case"scene:start":{const i={name:e.name,file:e.file,actors:(e.actors??[]).slice(),lanes:(e.actors??[]).map(p=>({actor:p,items:[]})),assertions:[],startTime:e.timestamp,endTime:null,status:"running",team:e.team??{},teamIndex:e.teamIndex??0},_=t.scenes.concat(i),c=(n=i.team)==null?void 0:n.name,l=c&&!t.teams.includes(c)?t.teams.concat(c):t.teams;return{...t,scenes:_,currentSceneIndex:_.length-1,teams:l}}case"action:start":return E(t,i=>{Ye(i,e.actor).items.push({action:e.action,target:e.target,startTime:e.timestamp,endTime:null,duration:null,error:null,status:"running"})});case"action:end":return E(t,i=>{const _=i.lanes.find(c=>c.actor===e.actor);if(_)for(let c=_.items.length-1;c>=0;c--){const l=_.items[c];if(l.status==="running"&&l.action===e.action){l.endTime=e.timestamp,l.duration=e.duration,l.error=e.error??null,l.status=e.error?"error":e.duration>500?"slow":"success";break}}});case"assertion":return E(t,i=>{i.assertions.push({actor:e.actor,description:e.description,result:e.result,timestamp:e.timestamp})});case"scene:end":{if(t.currentSceneIndex==null)return t;const i=E(t,c=>{c.endTime=e.timestamp,c.status=e.status,c.duration=e.duration,c.error=e.error}),_=e.status==="completed";return{...i,currentSceneIndex:null,passCount:i.passCount+(_?1:0),failCount:i.failCount+(_?0:1)}}case"run:progress":return{...t,progress:{pct:e.pct,failing:e.failing,flaky:e.flaky}};case"run:end":return{...t,running:!1,sceneCount:((o=e.summary)==null?void 0:o.scenes)??t.sceneCount,passCount:((s=e.summary)==null?void 0:s.completed)??t.passCount,failCount:((r=e.summary)==null?void 0:r.failed)??t.failCount,endDurationMs:e.duration};default:return t}}function E(t,e){const n=t.currentSceneIndex;if(n==null||n<0||n>=t.scenes.length)return t;const o=Qe(t.scenes[n]);e(o);const s=t.scenes.slice();return s[n]=o,{...t,scenes:s}}function Ze(t,e){return{...t,connection:e}}function et(t){return t.scenes.filter(e=>e.status!=="running").length}const x=Ge.bind(re);function tt(t,e){return e.kind==="event"?Xe(t,e.event):Ze(t,e.status)}function nt({transport:t}){const[e,n]=Fe(tt,void 0,Ue);Ie(()=>{let s=!0;t.fetchState().then(i=>{if(s)for(const _ of i)n({kind:"event",event:_})});const r=t.subscribe(i=>n({kind:"event",event:i}),i=>n({kind:"status",status:i}));return()=>{s=!1,r()}},[t]);const o=s=>{t.sendCommand(s)};return x`
    <div class="root">
      ${rt({state:e,send:o})}
      <main>
        ${e.scenes.length===0?x`<div class="waiting">
              <h2>Waiting for scene run…</h2>
              <p>Run <code>scenetest</code> to see the live timeline here.</p>
            </div>`:e.scenes.map((s,r)=>ot({scene:s,index:r,send:o}))}
      </main>
    </div>
  `}function rt({state:t,send:e}){const[n,o]=Z(""),[,s]=Z(0),r=t.running;Ie(()=>{if(!r)return;const a=setInterval(()=>s(u=>u+1),200);return()=>clearInterval(a)},[r]);const i=et(t),_=t.endDurationMs!=null?`${t.endDurationMs}ms`:t.runStartTime?`${Date.now()-t.runStartTime}ms`:"—",c=t.sceneCount>0?Math.round(i/t.sceneCount*100):0,l=t.failCount>0?"progress has-failures":i===t.sceneCount&&t.sceneCount>0?"progress done":"progress";return x`
    <header class=${r?"running":""}>
      <h1><span class="logo">S</span> Scenetest Dashboard</h1>
      <button class="replay-all-btn" disabled=${r} onClick=${()=>e({type:"run:replay",...n?{team:n}:{}})}>▶ Replay All</button>
      <label class="team-select-wrap">
        Team:
        <select
          value=${n}
          onChange=${a=>o(a.target.value)}
        >
          <option value="">all teams</option>
          ${t.teams.map(a=>x`<option value=${a}>${a}</option>`)}
        </select>
      </label>
      <button onClick=${()=>e({type:"run:pause"})}>❚❚ Pause</button>
      <button class="stop-btn" onClick=${()=>e({type:"run:stop"})}>■ Stop</button>
      <div class="spacer"></div>
      <div class="stats">
        <div class="stat"><span class="label">Scenes:</span><span class="value">${i}/${t.sceneCount}</span></div>
        <div class="stat pass"><span class="label">Pass:</span><span class="value">${t.passCount}</span></div>
        <div class="stat fail"><span class="label">Fail:</span><span class="value">${t.failCount}</span></div>
        <div class="stat"><span class="label">Time:</span><span class="value">${_}</span></div>
        <div
          class=${"conn "+t.connection}
          title=${"SSE "+t.connection}
        ></div>
      </div>
      ${t.sceneCount>0?x`<div class=${l}><div class="progress-fill" style=${`width:${c}%`}></div></div>`:null}
    </header>
  `}function ot({scene:t,index:e,send:n}){var _;const[o,s]=Z(!1),r=t.status==="completed"?"✓":t.status==="running"?"◷":"✗",i=()=>{it(st(t)),s(!0),setTimeout(()=>s(!1),1200)};return x`
    <div class=${"scene "+(t.status==="failed"||t.status==="timeout"?"failed":"")}>
      <div class="scene-head">
        <span class=${"scene-status "+t.status}>${r}</span>
        <span class="scene-name">${t.name}</span>
        ${t.file?x`<span class="scene-file">${t.file}</span>`:null}
        ${(_=t.team)!=null&&_.name?x`<span class="scene-team">${t.team.name}</span>`:null}
        ${t.duration!=null?x`<span class="scene-dur">${t.duration}ms</span>`:null}
        <button
          class=${"copy-btn"+(o?" copied":"")}
          title="Copy scene summary"
          onClick=${i}
        >
          ${o?"✓ Copied":"⧉ Copy"}
        </button>
        ${t.file?x`<button
              class="copy-btn"
              onClick=${()=>n({type:"run:replay",file:t.file})}
            >▶ Replay</button>`:null}
      </div>
      <div class="lanes">
        ${t.lanes.map(c=>x`
            <div class="lane">
              <span class="lane-actor">${c.actor}</span>
              <div class="lane-items">
                ${c.items.map(l=>x`
                    <span class=${"pill "+l.status} title=${l.error??""}>
                      ${l.action}${l.target?x`<span class="tgt"> ${l.target}</span>`:null}
                    </span>
                  `)}
              </div>
            </div>
          `)}
      </div>
      ${t.assertions.length>0?x`<div class="assertions">
            ${t.assertions.map(c=>x`
                <div class=${"assert "+(c.result?"ok":"bad")}>
                  <span class="mark">${c.result?"✓":"✗"}</span>
                  ${c.actor?x`<span class="who">[${c.actor}]</span>`:null}
                  <span>${c.description}</span>
                </div>
              `)}
          </div>`:null}
      ${t.error?x`<div class="scene-error">${t.error}</div>`:null}
    </div>
  `}function st(t){const e=[`Scene: ${t.name}`];t.file&&e.push(`File: ${t.file}`),t.status&&e.push(`Status: ${t.status}`),t.duration!=null&&e.push(`Duration: ${t.duration}ms`);const n=[];for(const s of t.lanes)for(const r of s.items)r.error&&n.push(`  ✗ ${r.action}${r.target?`(${r.target})`:""} — ${r.error}`);t.error&&!n.some(s=>s.includes(t.error))&&n.push(`  ✗ ${t.error}`),n.length>0&&e.push("","Errors:",...n);const o=t.assertions.filter(s=>!s.result);return o.length>0&&e.push("","Failed assertions:",...o.map(s=>`  ✗ [${s.actor??""}] ${s.description}`)),e.join(`
`)}function it(t){var e;typeof navigator<"u"&&((e=navigator.clipboard)!=null&&e.writeText)?navigator.clipboard.writeText(t).catch(()=>xe(t)):xe(t)}function xe(t){if(typeof document>"u")return;const e=document.createElement("textarea");e.value=t,e.style.position="fixed",e.style.opacity="0",document.body.appendChild(e),e.select();try{document.execCommand("copy")}catch{}document.body.removeChild(e)}const at=`
:host {
  /* ── Theming surface (host may override these four) ── */
  --st-bg: #0f1117;
  --st-accent: #3b82f6;
  --st-font: 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
  --st-font-size: 13px;

  /* ── Internal palette (derived; not a public surface) ── */
  --bg: var(--st-bg);
  --bg2: #1a1d27;
  --bg3: #252833;
  --border: #2e3140;
  --text: #e1e4ed;
  --text2: #8b8fa3;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
  --blue: var(--st-accent);

  display: block;
  font-family: var(--st-font);
  font-size: var(--st-font-size);
  color: var(--text);
  background: var(--bg);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

.root { min-height: 100%; background: var(--bg); }

header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
header.running .logo { animation: pulse 1.2s ease-in-out infinite; }

h1 { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.logo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: var(--blue); color: #fff; font-weight: 700;
}

button {
  font-family: inherit; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text);
  padding: 5px 10px; border-radius: 5px; display: inline-flex; align-items: center; gap: 6px;
}
button:hover:not(:disabled) { border-color: var(--blue); }
button:disabled { opacity: 0.5; cursor: default; }
.replay-all-btn { color: var(--green); }
.stop-btn { color: var(--red); }

.team-select-wrap { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 6px; }
select {
  font-family: inherit; font-size: 12px; background: var(--bg3); color: var(--text);
  border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px;
}

.spacer { flex: 1; }

.stats { display: flex; align-items: center; gap: 14px; font-size: 12px; }
.stat { display: flex; align-items: center; gap: 5px; }
.stat .label { color: var(--text2); }
.stat .value { font-weight: 600; }
.stat.pass .value { color: var(--green); }
.stat.fail .value { color: var(--red); }

.conn { width: 9px; height: 9px; border-radius: 50%; background: var(--text2); }
.conn.connected { background: var(--green); }
.conn.disconnected { background: var(--red); }

.progress { flex-basis: 100%; height: 3px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; width: 0; background: var(--blue); transition: width 0.2s ease; }
.progress.done .progress-fill { background: var(--green); }
.progress.has-failures .progress-fill { background: var(--red); }

main { padding: 16px 20px; }
.waiting { text-align: center; color: var(--text2); padding: 60px 20px; }
.waiting h2 { font-size: 16px; font-weight: 500; margin-bottom: 8px; color: var(--text); }
.waiting code { background: var(--bg3); padding: 2px 6px; border-radius: 4px; }

.scene {
  border: 1px solid var(--border); border-radius: 8px; background: var(--bg2);
  margin-bottom: 14px; overflow: hidden;
}
.scene.failed { border-color: var(--red); }
.scene-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-bottom: 1px solid var(--border); background: var(--bg3);
}
.scene-status { font-weight: 700; }
.scene-status.completed { color: var(--green); }
.scene-status.failed, .scene-status.timeout { color: var(--red); }
.scene-status.running { color: var(--amber); }
.scene-name { font-weight: 600; }
.scene-file { color: var(--text2); font-size: 11px; }
.scene-team {
  font-size: 11px; color: var(--blue); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 10px;
}
.scene-dur { color: var(--text2); font-size: 11px; margin-left: auto; }
.copy-btn { padding: 3px 7px; font-size: 11px; }
.copy-btn.copied { color: var(--green); border-color: var(--green); }

.lanes { padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; }
.lane { display: flex; align-items: flex-start; gap: 8px; }
.lane-actor { color: var(--text2); min-width: 90px; font-size: 11px; padding-top: 3px; }
.lane-items { display: flex; flex-wrap: wrap; gap: 4px; }
.pill {
  font-size: 11px; padding: 2px 7px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text);
}
.pill.running { border-color: var(--amber); color: var(--amber); }
.pill.success { border-color: var(--green); }
.pill.slow { border-color: var(--amber); }
.pill.error { border-color: var(--red); color: var(--red); }
.pill .tgt { color: var(--text2); }

.assertions { padding: 0 14px 10px; display: flex; flex-direction: column; gap: 3px; }
.assert { font-size: 12px; display: flex; gap: 6px; align-items: baseline; }
.assert .mark { font-weight: 700; }
.assert.ok .mark { color: var(--green); }
.assert.bad .mark { color: var(--red); }
.assert .who { color: var(--text2); }

.scene-error {
  margin: 0 14px 12px; padding: 8px 10px; border-radius: 6px;
  background: rgba(239, 68, 68, 0.1); border: 1px solid var(--red);
  color: var(--red); font-size: 12px; white-space: pre-wrap; cursor: pointer;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
`;function lt(t,e){const n=t.shadowRoot??t.attachShadow({mode:"open"});n.innerHTML="";const o=document.createElement("style");o.textContent=at,n.appendChild(o),e.theme&&_t(n,e.theme);const s=document.createElement("div");return n.appendChild(s),ue(re(nt,{transport:e.transport}),s),{unmount(){ue(null,s),n.innerHTML=""}}}function _t(t,e){const n=t.host;e.bg&&n.style.setProperty("--st-bg",e.bg),e.accent&&n.style.setProperty("--st-accent",e.accent),e.font&&n.style.setProperty("--st-font",e.font),e.fontSize&&n.style.setProperty("--st-font-size",e.fontSize)}function ct(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ut(t){return typeof t=="string"}function pt(t){return typeof t=="number"&&Number.isFinite(t)}function dt(t){return ct(t)&&ut(t.type)&&pt(t.timestamp)}function ft(t={}){const e=(t.base??"/__scenetest").replace(/\/+$/,"");return{async fetchState(){return[]},subscribe(n,o){const s=new EventSource(`${e}/events`),r=i=>o==null?void 0:o(i);return r("connecting"),s.onopen=()=>r("connected"),s.onerror=()=>r("disconnected"),s.onmessage=i=>{let _;try{_=JSON.parse(i.data)}catch{return}dt(_)&&n(_)},()=>s.close()},async sendCommand(n){const o=(s,r)=>fetch(`${e}${s}`,{method:"POST",headers:{"Content-Type":"application/json"},body:r===void 0?void 0:JSON.stringify(r)});switch(n.type){case"run:replay":{const s={};n.file&&(s.file=n.file),n.team&&(s.team=n.team),await o("/replay",s);return}case"run:stop":await o("/stop");return;case"run:pause":case"run:resume":await o("/pause");return}}}}const $e=document.getElementById("root");$e&&lt($e,{transport:ft()});
