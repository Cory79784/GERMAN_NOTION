import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const legacy=/\bid=["'](?:gate|login-form)["']|\btype=["']password["']|\bclass=["'][^"']*\bwelcome\b/i;
if(legacy.test(html))throw new Error('禁止发布旧欢迎页或登录表单：入口必须直接显示学习界面');
if(!/\bid=["']app["']/.test(html)||/<[^>]*\bid=["']app["'][^>]*\bhidden\b/i.test(html))throw new Error('学习界面必须在初始 HTML 中直接可见');
console.log('入口检查通过：无欢迎页、无登录表单，学习界面始终可见');
