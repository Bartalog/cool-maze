import {Component} from 'react';
import Item from './item.js';

class Inbox extends Component {
    render() {
      return (
        <div id="inbox">
          <Item {...this.props} />
        </div>
      )
    }
}
  

export default Inbox;