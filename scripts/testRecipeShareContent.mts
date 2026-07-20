import {strict as assert} from 'node:assert'
import recipeContentHelpers from '../src/utils/recipeShareContent'

const {extractPosterSections} = recipeContentHelpers

const parsed = extractPosterSections(`# 番茄炒蛋
## 食材用量
- 番茄：300g
- 鸡蛋：2个
## 烹饪步骤
1. 番茄切块
2. 鸡蛋炒熟
## 营养特点
- 蛋白质丰富`)

assert.deepEqual(parsed.ingredients, ['番茄：300g', '鸡蛋：2个'])
assert.deepEqual(parsed.steps, ['番茄切块', '鸡蛋炒熟'])
assert.deepEqual(parsed.nutrition, ['蛋白质丰富'])
assert.deepEqual(extractPosterSections('普通文本').steps, [])

console.log('recipe share content tests passed')
