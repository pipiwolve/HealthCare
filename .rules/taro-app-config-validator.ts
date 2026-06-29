/** Oxlint 自定义插件 - 验证 Taro app.config.ts 配置 */

import fs from 'node:fs';
import path from 'node:path';
import type { Rule, ESLint } from 'eslint';
import { ResolverFactory } from 'oxc-resolver';
import type {
  Node,
  VariableDeclarator,
  Property,
  ObjectExpression,
  ArrayExpression,
  Expression,
  SpreadElement,
  SimpleLiteral,
  Literal,
  Identifier,
} from 'estree';

type PropertyWithParent = Property & Rule.NodeParentExtension;

type PropMap = Record<string, Property>;

const taroAppConfigValidatorRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure 'pages' and 'subPackages' pages exist as source files, and 'tabBar.list' contains 2-5 items for WeChat mini-program compatibility",
    },
    messages: {
      tooFewListItems: "WeChat mini-program requires at least 2 tab items. Current tabBar.list has {{count}} item(s). Please add more tabs or remove the tabBar configuration.",
      tooManyListItems: "WeChat mini-program cannot publish with more than 5 tabs. Current tabBar.list has {{count}} items. Please reduce the number of tabs to 5 or fewer.",
      pageFileNotFound: "Page file 'src/{{pagePath}}' does not exist. Please either create the file or remove '{{pagePath}}' from the pages array in app.config.ts.",
      subPackagePageFileNotFound: "Sub-package page file 'src/{{root}}/{{pagePath}}' does not exist. Please either create the file or remove '{{pagePath}}' from subPackages[root='{{root}}'] in app.config.ts.",
      subPackageMissingRoot: "subPackages entry is missing required 'root' field.",
      subPackageMissingPages: "subPackages entry with root='{{root}}' is missing required 'pages' field.",
      subPackageRootHasSlash: "subPackages 'root' value '{{root}}' must not start or end with '/'. Use a plain directory name like 'sub-book'.",
      subPackageRootEmpty: "subPackages 'root' value must not be an empty string. Use a plain directory name like 'sub-book'.",
      subPackagePageEmpty: "subPackages page path must not be an empty string in subPackages[root='{{root}}'].",
      iconFileNotFound: "TabBar icon file 'src/{{iconPath}}' does not exist. Please download or create the icon file, or fix the path in tabBar.list.",
    },
    schema: [],
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    // 查找项目根目录（包含 package.json 的目录）
    let projectRoot: string = path.dirname(context.filename);
    while (projectRoot !== path.dirname(projectRoot)) {
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        break;
      }
      projectRoot = path.dirname(projectRoot);
    }

    // 初始化 oxc-resolver
    const resolver = new ResolverFactory({
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    });

    /**
     * 用 oxc-resolver 检查页面文件是否存在
     */
    function resolvePageFile(baseDir: string, pagePath: string): boolean {
      const result = resolver.sync(baseDir, `./${pagePath}`);
      return !result.error;
    }

    /**
     * 类型谓词：节点是否为Property类型
     */
    function isProperty(node: Node): node is Property {
      return node.type === "Property";
    }

    /**
     * 类型谓词：节点是否为字符串
     */
    function isStringLiteral(node: Expression | SpreadElement | null): node is SimpleLiteral & { value: string } {
      return node !== null && node.type === "Literal" && typeof (node as Literal).value === "string";
    }

    /**
     * 构建查找字典（属性名为 key，Property 节点为 value）
     */
    function indexProps(objNode: ObjectExpression): PropMap {
      const props: PropMap = {};
      for (const prop of objNode.properties) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
          props[(prop.key as Identifier).name] = prop;
        }
      }
      return props;
    }

    /**
     * 校验 subPackages 条目的 root 字段，有效返回字符串，无效报错返回 null
     */
    function validateSubPackageRoot(objNode: ObjectExpression, props: PropMap): string | null {
      if (!props.root) {
        context.report({ node: objNode, messageId: "subPackageMissingRoot" });
        return null;
      }

      const rootValue = props.root.value;
      if (rootValue.type !== "Literal" || typeof (rootValue as Literal).value !== "string") {
        return null;
      }

      const root = (rootValue as SimpleLiteral).value as string;

      if (root === '') {
        context.report({ node: rootValue, messageId: "subPackageRootEmpty" });
        return null;
      }

      if (root.startsWith('/') || root.endsWith('/')) {
        context.report({ node: rootValue, messageId: "subPackageRootHasSlash", data: { root } });
        return null;
      }

      return root;
    }

    /**
     * 检查主包 pages 数组中每个页面文件是否存在
     */
    function checkPagesArray(elements: ArrayExpression['elements']): void {
      const srcDir = path.join(projectRoot, 'src');
      for (const element of elements) {
        if (isStringLiteral(element)) {
          const pagePath = element.value;
          if (!resolvePageFile(srcDir, pagePath)) {
            context.report({
              node: element,
              messageId: "pageFileNotFound",
              data: { pagePath },
            });
          }
        }
      }
    }

    /**
     * 检查 subPackages 数组中每个分包的结构及页面文件是否存在
     */
    function checkSubPackagesArray(elements: ArrayExpression['elements']): void {
      for (const element of elements) {
        if (!element || element.type !== "ObjectExpression") continue;

        const objNode = element as ObjectExpression;

        // 构建属性查找字典
        const props = indexProps(objNode);

        const root = validateSubPackageRoot(objNode, props);
        if (root === null) continue;

        // 校验必须有 pages 字段
        if (!props.pages) {
          context.report({ node: objNode, messageId: "subPackageMissingPages", data: { root } });
          continue;
        }

        const pagesValue = props.pages.value;
        if (pagesValue.type !== "ArrayExpression") continue;

        // 以 src/<root>/ 为基准目录解析每个页面
        const subDir = path.join(projectRoot, 'src', root);
        for (const pageNode of (pagesValue as ArrayExpression).elements) {
          if (!isStringLiteral(pageNode)) continue;
          const pagePath = pageNode.value;

          if (pagePath === '') {
            context.report({ node: pageNode, messageId: "subPackagePageEmpty", data: { root } });
            continue;
          }

          if (!resolvePageFile(subDir, pagePath)) {
            context.report({ node: pageNode, messageId: "subPackagePageFileNotFound", data: { root, pagePath } });
          }
        }
      }
    }

    /**
     * 检查 tabBar.list 每个 tab 项的 iconPath / selectedIconPath 文件是否存在
     */
    function checkTabBarIcons(listNode: ArrayExpression): void {
      const ICON_PROPS = new Set(['iconPath', 'selectedIconPath']);

      for (const element of listNode.elements) {
        if (!element || element.type !== "ObjectExpression") continue;

        for (const prop of (element as ObjectExpression).properties) {
          if (prop.type !== "Property" || prop.key.type !== "Identifier") continue; // 跳过展开属性（...x）
          const keyName = (prop.key as Identifier).name;
          if (!ICON_PROPS.has(keyName)) continue;                                   // 跳过非图标字段
          if (prop.value.type !== "Literal" || !isStringLiteral(prop.value as Expression)) continue; // 跳过非字符串值

          const iconPath = (prop.value as SimpleLiteral).value as string;
          if (!fs.existsSync(path.join(projectRoot, 'src', iconPath))) {
            context.report({ node: prop.value, messageId: "iconFileNotFound", data: { iconPath } });
          }
        }
      }
    }

    return {
      /**
       * 匹配 `const pages = [...]` 和 `const subPackages = [...]` 形式的变量声明
       */
      VariableDeclarator(node: VariableDeclarator & Rule.NodeParentExtension) {
        if (!node.init || node.id.type !== "Identifier") return;
        const name = (node.id as Identifier).name;

        if (name === "pages" && node.init.type === "ArrayExpression") {
          checkPagesArray((node.init as ArrayExpression).elements);
        } else if (name === "subPackages" && node.init.type === "ArrayExpression") {
          checkSubPackagesArray((node.init as ArrayExpression).elements);
        }
      },

      /**
       * 匹配对象字面量中 `pages: [...]` 属性
       */
      "Property[key.name='pages'][value.type='ArrayExpression']"(node: PropertyWithParent) {
        const grandParent = (node.parent as Node & Rule.NodeParentExtension).parent as Node | undefined;
        if (grandParent?.type === "ArrayExpression") return;
        checkPagesArray((node.value as ArrayExpression).elements);
      },

      /**
       * 匹配对象字面量中 `subPackages: [...]` 属性
       */
      "Property[key.name='subPackages'][value.type='ArrayExpression']"(node: PropertyWithParent) {
        checkSubPackagesArray((node.value as ArrayExpression).elements);
      },

      /**
       * 访问所有对象属性节点，检查 tabBar.list 数组
       * tabBar: {           <- grandParent (Property)
       *   list: [           <- node (Property)
       *     {...},          <- 数组元素
       *     {...}
       *   ]
       * }
       */
      Property(node: PropertyWithParent) {
        // 检查是否为 'list' 属性
        if (
          node.key.type !== "Identifier" ||
          (node.key as Identifier).name !== "list" ||
          node.value.type !== "ArrayExpression"
        ) return;

        // 通过检查父节点结构，确认这是 tabBar 内的 list
        const parent = node.parent as Node;
        if (parent.type !== "ObjectExpression") return;

        // 检查祖父节点是否为 'tabBar' 属性
        const grandParent = (parent as Node & Rule.NodeParentExtension).parent as Node | undefined;
        if (
          !grandParent ||
          !isProperty(grandParent) ||
          grandParent.key.type !== "Identifier" ||
          (grandParent.key as Identifier).name !== "tabBar"
        ) return;

        const listNode = node.value as ArrayExpression;

        // 获取数组元素数量
        const arrayLength = listNode.elements.length;

        // 如果少于 2 个元素，向 context 报告错误
        if (arrayLength < 2) {
          context.report({
            node: node.value,
            messageId: "tooFewListItems",
            data: { count: String(arrayLength) },
          });
        }

        // 如果超过 5 个元素，向 context 报告错误
        if (arrayLength > 5) {
          context.report({
            node: node.value,
            messageId: "tooManyListItems",
            data: { count: String(arrayLength) },
          });
        }

        // 检查每个 tab 项的 iconPath 和 selectedIconPath 是否存在
        checkTabBarIcons(listNode);
      },
    };
  },
};

const plugin: ESLint.Plugin = {
  meta: {
    name: "taro-app-config-validator",
  },
  rules: {
    "taro-app-config-validator": taroAppConfigValidatorRule,
  },
};

export default plugin;
