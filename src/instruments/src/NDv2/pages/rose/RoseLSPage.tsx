import { FSComponent, Subject, VNode } from 'msfssdk';
import { RoseMode } from './RoseMode';
import { TrackBug } from '../../shared/TrackBug';
import { RoseModeUnderlay } from './RoseModeUnderlay';
import { NDControlEvents } from '../../NDControlEvents';
import { IlsInfoIndicator } from './IlsInfoIndicator';
import { GlideSlope } from './Glideslope';

export class RoseLSPage extends RoseMode {
    isVisible = Subject.create(false);

    onShow() {
        super.onShow();

        const publisher = this.props.bus.getPublisher<NDControlEvents>();

        publisher.pub('set_show_map', false);
    }

    render(): VNode | null {
        return (
            <g visibility={this.isVisible.map((v) => (v ? 'visible' : 'hidden'))}>
                <IlsInfoIndicator bus={this.props.bus} />

                <GlideSlope bus={this.props.bus} />

                <RoseModeUnderlay
                    bus={this.props.bus}
                    heading={this.props.heading}
                    visible={this.isVisible}
                />

                <TrackBug
                    bus={this.props.bus}
                    isUsingTrackUpMode={this.props.isUsingTrackUpMode}
                />
            </g>
        );
    }
}
