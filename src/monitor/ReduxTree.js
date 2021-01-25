import React, { Component } from "react"
import PropTypes from "prop-types"
import JSONTree from "react-json-tree"
import styled from "styled-components"

const FadeSpan = styled.span`
  opacity: ${props => (props.fullOpacity ? 1 : 0.3)};
  font-size: 16.5px;
  line-height: 1.4;
`

const KeySpan = FadeSpan.extend`
  position: relative;
  color: ${props => (props.breakpointActive ? "red" : null)};
  font-weight: ${props => (props.breakpointActive ? "bold" : "normal")};
  cursor: pointer;
`

const InfoContainer = styled.div`
  margin-top: 1.5rem;
  margin-bottom: 1rem;
`

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

class ReduxTree extends Component {
  static propTypes = {
    theme: PropTypes.object.isRequired,
    currentBreakpoint: PropTypes.string,
    setBreakpoint: PropTypes.func.isRequired,
    used: PropTypes.object.isRequired,
    stateCopy: PropTypes.object.isRequired,
    numberOfProps: PropTypes.number.isRequired,
    storeSize: PropTypes.number.isRequired
  }

  isUsed(path) {
    let used = this.props.used
    for (let i = 0; i < path.length; i++) {
      used = used[path[i]]
      // null is used as placeholders in arrays
      if (used === undefined || used === null) return false
    }
    return true
  }

  setBreakpointOnClick = breakpointPath => e => {
    if (!e.shiftKey) return
    if (breakpointPath === this.props.currentBreakpoint) {
      this.props.setBreakpoint("")
    } else {
      this.props.setBreakpoint(breakpointPath)
    }
    e.stopPropagation()
  }

  getItemString = (type, data, itemType, itemString) => {
    const propertyCount = deepCount(data);
    const propertyCountPercentage = this.props.numberOfProps ? (propertyCount / this.props.numberOfProps) * 100 : 0;
    const sizeOfData = JSON.stringify(data).length;
    const sizePercentage = this.props.storeSize ? (sizeOfData / this.props.storeSize) * 100 : 0;

    return (
      <React.Fragment>
        <FadeSpan>{itemType}</FadeSpan>
        <span style={{ color: this.props.theme.base0B, marginRight: '.3em' }}>
          {Math.round((propertyCountPercentage + Number.EPSILON) * 100) / 100}%
        </span>
        <span style={{ color: this.props.theme.base0F }}>
          {Math.round((sizePercentage + Number.EPSILON) * 100) / 100}%
        </span>
      </React.Fragment>
    );
  }

  valueRenderer = (val, ...args) => {
    const isUsed = this.isUsed(args.slice(1).reverse())
    return <FadeSpan fullOpacity={isUsed}>{val}</FadeSpan>
  }

  labelRenderer = (keyPath, type) => {
    const isUsed = this.isUsed(keyPath.slice().reverse())
    const breakpointPath = keyPath
      .slice()
      .reverse()
      .join(".")

    const breakpointActive = breakpointPath === this.props.currentBreakpoint

    return (
      <KeySpan
        fullOpacity={isUsed}
        breakpointActive={breakpointActive}
        onClick={this.setBreakpointOnClick(breakpointPath)}
      >
        {keyPath[0]}
      </KeySpan>
    )
  }

  render() {
    const { used, stateCopy, theme, currentBreakpoint, numberOfProps, storeSize } = this.props
    const usedLength = JSON.stringify(used).length
    const totalLength = JSON.stringify(stateCopy).length
    const percentUsed = usedLength > 2 ? `${Math.round(usedLength / totalLength * 100)}%` : "N/A"

    return (
      <div>
        <InfoContainer>
          Estimated percentage used: <span style={{ color: theme.base0D }}>{percentUsed}</span>
        </InfoContainer>
        <InfoContainer>
          Total number of props: <span style={{ color: theme.base0B }}>{numberOfProps}</span>
        </InfoContainer>
        <InfoContainer>
          Store size: <span style={{ color: theme.base0F }}>{storeSize}</span>
        </InfoContainer>
        <JSONTree
          data={stateCopy}
          hideRoot
          theme={theme}
          invertTheme={false}
          getItemString={this.getItemString}
          valueRenderer={this.valueRenderer}
          labelRenderer={this.labelRenderer}
          // force re-rendering when breakpoint changes
          currentBreakpoint={currentBreakpoint}
          // force re-rendering when "used" report key changes
          used={used}
        />
      </div>
    )
  }
}

export default ReduxTree
