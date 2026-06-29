import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'src/utils/aiPromptHelpers.ts')
const source = readFileSync(sourcePath, 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: 99,
    target: 99,
  },
}).outputText

const moduleUrl = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
const helpers = await import(moduleUrl)

function assertEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assertEqual(
  helpers.parseRecognizedFoods('这个啊...草莓'),
  ['草莓'],
  'removes conversational image-recognition prefix'
)

assertEqual(
  helpers.parseRecognizedFoods('让我看看.番茄'),
  ['番茄'],
  'removes observation filler before recognized food name'
)

assertEqual(
  helpers.parseRecognizedFoods('图片中包括：草莓、蓝莓\\n2. 香蕉。'),
  ['草莓', '蓝莓', '香蕉'],
  'parses common delimiter and list formats'
)

const chatPrompt = helpers.buildChatPrompt({
  userQuestion: '今天吃什么比较健康？',
  healthContext: '【用户健康档案】\\n过敏源：花生',
  ingredientContext: '当前称重食材：鸡胸肉100g',
})

assert(chatPrompt.includes('请用不超过400字回答'), 'chat prompt limits response length')
assert(chatPrompt.includes('先给结论'), 'chat prompt asks for direct answer first')
assert(chatPrompt.includes('请咨询专业医生'), 'chat prompt keeps medical disclaimer')

const visionPrompt = helpers.buildFoodRecognitionPrompt('final')
assert(visionPrompt.includes('只输出食材名'), 'vision prompt enforces names only')
assert(visionPrompt.includes('不要输出“这个啊”'), 'vision prompt forbids filler phrase')

console.log('ai prompt helper checks passed')
