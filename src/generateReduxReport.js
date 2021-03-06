import { diff } from "deep-object-diff"
import StackTrace from "stacktrace-js"
import { isObjectOrArray } from "./utility"
import { createMakeProxyFunction } from "./trackObjectUse"
import debounce from "lodash.debounce"

// we need source maps for the stack traces
// or else we won't know whether to ignore object access
// from non-local code (e.g node_modules, browser extensions...)
// this takes the stack trace file name from e.g.
// fileName: "http://localhost:3001/static/js/bundle.js",
// to "http://localhost:3000/Users/alexholachek/Desktop/work/redux-usage-report/todomvc-example/src/containers/App.js
// this raises an error during jest tests so limit to development
if (process.env.NODE_ENV === "development") {
  require("./lib/browser-source-map-support")
  sourceMapSupport.install() // eslint-disable-line
}

const localStorageKey = "reduxUsageReportBreakpoints"

// so that JSON.stringify doesn't remove all undefined fields
function replaceUndefinedWithNull(obj) {
  Object.keys(obj).forEach(k => {
    const val = obj[k]
    if (val === undefined) {
      obj[k] = null
    }
    if (isObjectOrArray(val)) {
      replaceUndefinedWithNull(val)
    }
  })
}

let globalObjectCache

const shouldSkipProxy = () => {
  if (global.reduxReport.__inProgress || global.reduxReport.__reducerInProgress) return true

  if (!global.reduxReport.__skipAccessOriginCheck) {
    const stackFrames = StackTrace.getSync()
    const initiatingFunc =
      stackFrames[stackFrames.findIndex(s => s.functionName === "Object.get") + 1]

    const initiatingFuncNotLocal =
      !!initiatingFunc &&
      initiatingFunc.fileName &&
      (initiatingFunc.fileName.match(/\.\/~\/|\/node_modules\//) ||
        initiatingFunc.fileName.match(/extension:\/\//))

    if (!!initiatingFuncNotLocal) return true
  }
  return false
}

const deepCount = function (data) {
  function count(obj) {
    let counter = 0;

    for (let key in obj) {
      if (obj[key] !== null && typeof obj[key] === "object") {
        counter += count(obj[key]);
      } else {
        counter++;
      }
    }

    return counter;
  }

  return count(data);
};

// this function takes a reducer and returns
// an augmented reducer that tracks redux usage
function generateReduxReport(global, rootReducer) {
  globalObjectCache = globalObjectCache || global
  global.reduxReport = global.reduxReport || {
    accessedState: {},
    state: {},
    setOnChangeCallback(cb) {
      global.reduxReport.onChangeCallback = debounce(cb, 10)
    },
    removeOnChangeCallback() {
      global.reduxReport.onChangeCallback = undefined
    },
    setBreakpoint: function (breakpoint) {
      if (!global.localStorage) return
      global.localStorage.setItem(localStorageKey, breakpoint)
    },
    clearBreakpoint: function () {
      if (!global.localStorage) return
      global.localStorage.setItem(localStorageKey, null)
    },
    generate() {
      global.reduxReport.__inProgress = true
      const used = JSON.parse(JSON.stringify(this.accessedState))
      const stateCopy = JSON.parse(JSON.stringify(this.state))
      const unused = diff(stateCopy, used)
      replaceUndefinedWithNull(unused)
      const usedLength = JSON.stringify(used).length;
      const totalLength = JSON.stringify(stateCopy).length;
      const percentUsed = usedLength > 2 ? Math.round(usedLength / totalLength * 100) : null;
      const requestContext = stateCopy && stateCopy.preso && stateCopy.preso.requestContext;
      const { query, verticalId } = requestContext;
      const numberOfProps = deepCount(stateCopy);
      const storeSize = (new TextEncoder().encode(JSON.stringify(stateCopy))).length;
      const report = {
        used,
        unused,
        stateCopy,
        percentUsed,
        query,
        verticalId,
        numberOfProps,
        storeSize
      }
      global.reduxReport.__inProgress = false
      return report
    }
  }

  const makeProxy = createMakeProxyFunction({
    shouldSkipProxy,
    accessedProperties: global.reduxReport.accessedState,
    getBreakpoint: () => global.localStorage && global.localStorage.getItem(localStorageKey),
    onChange: stateLocation =>
      global.reduxReport.onChangeCallback && global.reduxReport.onChangeCallback(stateLocation)
  })

  // this function replaces the previous root reducer
  // it will break if the DevTools.instrument() call came before generateReduxReport
  // in the compose order
  return (prevState, action) => {
    global.reduxReport.__reducerInProgress = true
    const state = rootReducer(prevState, action)
    const proxiedState = makeProxy(state)
    global.reduxReport.__reducerInProgress = false

    global.reduxReport.state = proxiedState
    if (global.reduxReport.onChangeCallback)
      setTimeout(() => global.reduxReport.onChangeCallback(""), 1)
    return proxiedState
  }
}

// "next" is either createStore or a wrapped version from another enhancer
const storeEnhancer = (global = window) => next => (reducer, ...args) => {
  const wrappedReducer = generateReduxReport(global, reducer)
  const store = next(wrappedReducer, ...args)
  return { ...store, replaceReducer: nextReducer => generateReduxReport(global, nextReducer) }
}

export default storeEnhancer
