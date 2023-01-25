import { FSComponent, DisplayComponent, VNode, Subject, EventBus } from 'msfssdk';
import { TuningMode } from '@fmgc/radionav';
import { Layer } from '../../../MsfsAvionicsCommon/Layer';
import { VorSimVars } from '../../../MsfsAvionicsCommon/providers/VorBusPublisher';

export interface IlsInfoIndicatorProps {
    bus: EventBus,
    index: 1 | 2,
}

export class IlsInfoIndicator extends DisplayComponent<IlsInfoIndicatorProps> {
    private readonly ilsIdent = Subject.create('');

    private readonly ilsFrequency = Subject.create(-1);

    private readonly locCourse = Subject.create(-1);

    private readonly vorTuningMode = Subject.create<TuningMode>(TuningMode.Manual);

    private readonly locAvailable = Subject.create(false);

    private readonly frequencyIntTextSub = Subject.create('');

    private readonly frequencyDecimalTextSub = Subject.create('');

    private readonly courseTextSub = Subject.create('');

    private readonly tuningModeTextSub = Subject.create('');

    onAfterRender(node: VNode) {
        super.onAfterRender(node);

        const subs = this.props.bus.getSubscriber<VorSimVars>();

        // TODO select correct MMR

        subs.on('nav3Ident').whenChanged().handle((value) => {
            this.ilsIdent.set(value);
        });

        subs.on('nav3Frequency').whenChanged().handle((value) => {
            this.ilsFrequency.set(value);
        });

        subs.on('nav3Localizer').whenChanged().handle((value) => {
            this.locCourse.set(value);
        });

        subs.on('nav3TuningMode').whenChanged().handle((value) => {
            this.vorTuningMode.set(value);
        });

        subs.on('localizerValid').whenChanged().handle((value) => {
            this.locAvailable.set(value);
        });

        this.ilsFrequency.sub((frequency) => {
            const [int, dec] = frequency.toFixed(2).split('.', 2);

            this.frequencyIntTextSub.set(int);
            this.frequencyDecimalTextSub.set(dec);
        }, true);

        this.locCourse.sub((course) => {
            this.courseTextSub.set(course > 0 ? Math.round(course).toString().padStart(3, '0') : '---');
        }, true);
    }

    private readonly visibilityFn = (v) => (v ? 'inherit' : 'hidden');

    render(): VNode | null {
        return (
            <Layer x={748} y={28}>
                <text x={-102} y={0} fontSize={25} class="White" textAnchor="end">
                    ILS
                    {this.props.index.toString()}
                </text>

                <g visibility={this.locAvailable.map(this.visibilityFn)}>
                    <text x={0} y={0} fontSize={25} class="White" textAnchor="end">
                        {this.frequencyIntTextSub}
                        <tspan fontSize={20}>
                            .
                            {this.frequencyDecimalTextSub}
                        </tspan>
                    </text>
                </g>

                <text x={-56} y={30} fontSize={25} class="White" textAnchor="end">CRS</text>
                <text x={20} y={30} fontSize={25} textAnchor="end">
                    <tspan class="Magenta">{this.courseTextSub}</tspan>
                    <tspan class="Cyan">&deg;</tspan>
                </text>

                <g visibility={this.ilsFrequency.map((v) => v > 0).map(this.visibilityFn)}>
                    <text x={-80} y={58} fontSize={20} class="Magenta" textAnchor="end" textDecoration="underline">
                        {this.tuningModeTextSub}
                    </text>
                </g>

                <text x={0} y={60} fontSize={25} class="Magenta" textAnchor="end">
                    {this.ilsIdent}
                </text>
            </Layer>
        );
    }
}
