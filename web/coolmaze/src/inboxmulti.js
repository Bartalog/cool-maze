import {Component} from 'react';
import Item from './item.js';
import MdLockOutline from 'react-icons/lib/md/lock-outline';
import { withTranslation, Trans } from 'react-i18next';

class InboxMulti extends Component {
    render() {

        const { t } = this.props;
        let e2eeLock;
        if(this.props.e2ee)
          e2eeLock = <div className="e2ee-message item-extra-info" key="e2ee-message"><MdLockOutline/>{t('item.e2ee.text')} <span title={t('item.e2ee.tooltip')} className="hint">{t('item.e2ee.e2ee')}</span>.</div>;

        var items = this.props.items;
        var subBoxes = [];
        for (var i=0; i < items.length; i++) {
          subBoxes.push(
            <div className="multi-item" key={i}>
              <Item multiIndex={i}
                  multiCount={items.length}
                  e2ee={this.props.e2ee}
                  {...items[i]} 
                  spinning={this.props.spinning} />
            </div>
          )
        }
  
        return [
          e2eeLock,
          <div id="inbox-multi">
            {subBoxes}
          </div>
        ];
    }
}
  
export default withTranslation()(InboxMulti);