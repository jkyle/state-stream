import Immutable from 'immutable';
import Stream from './stream';

/**
 * A Funnel is a special type of Stream that combines the states from feeder
 * streams.
 * @extends {Stream}
 */
class Funnel extends Stream {

  /**
   * A Funnel is a special type of Stream that combines the states from feeder
   * streams. Once all of the feeder streams have sent state, the Funnel will send the combined
   * state to any observers. When creating the Funnel, the sourceMap describes the shape of
   * the combined state. The key for each stream will be the key used to access the state of
   * that stream on the combined state object.
   *
   * @access public
   * @param  {Immutable.Map} sourceMap - a Map of the feeder streams.
   * @return {Funnel}           returns an instance of the Funnel stream.
   */
  constructor (sourceMap) {
    if(!sourceMap){
      throw new Error('You must supply a source map to a funnel');
    }

    if(!Immutable.Iterable.isKeyed(sourceMap)){
      throw new Error('You must supply an Immutable.Map as a source map to a funnel');
    }
    super(Immutable.Map());

    /**
     * @access private
     */
    this.primed = false;

    /**
     * @access private
     */
    this.sourceMap = sourceMap;

    /**
     * @access private
     */
    this.sourceKeys = sourceMap.keySeq();

    /**
     * @access private
     */
    this.subscribers = sourceMap.map((sourceStream, key) => {
      if(sourceStream.type === 'VIEW') {
          throw new Error('Funnels cannot subscribe to Views. At key ' + key);
      }

      return sourceStream.subscribe(newState => {

        /**
         * @ignore
         */
        this.state = this.state.set(key, newState);
      });
    });

    /**
     * @access private
     * @override
     */
    this.type = 'FUNNEL';
  }

  /**
   * sendState - overrides Stream's `sendState` by enforcing that all feeder streams have
   * sent state before sending state on to observers. Once a Funnel is `primed` it will pass
   * state on, regardless if one stream sends `undefined`.
   *
   * @access private
   * @param  {Immutable} newState - new state (received internally from Stream's `next` method)
   * @override
   */
  sendState (newState) {
    if(this.primed){
      super.sendState(newState);
    } else {
      if (this.sourceKeys.every(source => newState.get(source))) {
        this.primed = true;
        super.sendState(newState);
      } else {
        this._state = newState;
      }
    }
  }

  /**
   * subscribe - Overwrites base Stream class's subscribe method.
   * Funnels should not emit state to subscribers until all source
   * streams have defined state.
   *
   * @param  {function} observer the obeserver function to listen to state changes.
   * @return {object}          a subscriber object
   */
  subscribe (observer) {

    /**
     * @ignore
     */
    this.observers = this.observers.push(observer);
    if(this.primed) { observer(this._state); }
    return {
      unsubscribe: () => {
        const idx = this.observers.indexOf(observer);
        if (idx >= 0) {
          this.observers = this.observers.delete(this.observers.indexOf(observer));
        } else {
          throw new RangeError('Observer is not subscribed to this stream.');
        }
      }
    };
  }

  /**
   * forceState - Funnels can accept new state an send state back up
   * the subscription chain. This should only be used in cases of
   * restoring state.
   *
   * @access public
   * @param  {Immutable} state The new state to hydrate the funnel.
   * @override
   */
  forceState (state) {
    this._state = state;
    this.sourceMap.forEach((sourceStream, key) => {
      sourceStream.forceState(state.get(key));
    });
    this.sendState(state);
  }

  /**
   * destroy - cleans up a Funnel's feeder subscribers.
   *
   * @access public
   */
  destroy () {
    this.subscribers.forEach(subscriber => subscriber.unsubscribe());
  }

}

/** @ignore Export the Funnel class. */
export default Funnel;
