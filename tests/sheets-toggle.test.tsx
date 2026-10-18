import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoogleSheetsSetup } from '../src/components/Automations/GoogleSheetsSetup';
function findSwitch(element:any):any {
 if(!element||typeof element!=='object')return;
 if(element.props?.role==='switch')return element;
 for(const child of [element.props?.children].flat(Infinity)){const result=findSwitch(child);if(result)return result;}
}
test('optional Sheets switch toggles by its button, and hides connection controls when off',()=>{
 let enabled=false;
 const props={get enabled(){return enabled;},onEnabledChange:(value:boolean)=>enabled=value,connected:false,email:'',loading:false,error:'',onConnect(){},onRetry(){}};
 let view=GoogleSheetsSetup(props);assert.equal(findSwitch(view).props['aria-checked'],false);
 assert.ok(!renderToStaticMarkup(view).includes('Connect Google Sheets</button>'));
 findSwitch(view).props.onClick();view=GoogleSheetsSetup(props);assert.equal(findSwitch(view).props['aria-checked'],true);
 assert.match(renderToStaticMarkup(view),/Connect Google Sheets/);
 findSwitch(view).props.onClick();assert.equal(enabled,false);
});
test('turning tracking off preserves connection and shows no stale error or column controls',()=>{
 const props={enabled:false,onEnabledChange(){},connected:true,email:'example@example.test',loading:false,error:'Old Google failure',onConnect(){},onRetry(){},children:'column controls'};
 const html=renderToStaticMarkup(GoogleSheetsSetup(props));assert.ok(!html.includes('Old Google failure'));assert.ok(!html.includes('column controls'));
 assert.match(renderToStaticMarkup(GoogleSheetsSetup({...props,enabled:true})),/column controls/);
});
