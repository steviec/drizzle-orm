import type { ColumnBaseConfig } from '~/column';
import { Column } from '~/column';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderExtraConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	MakeColumnConfig,
} from '~/column-builder';
import { ColumnBuilder } from '~/column-builder';
import { entityKind } from '~/entity';
import { iife, type Update } from '~/utils';

import type { ForeignKey, UpdateDeleteAction } from '~/pg-core/foreign-keys';
import { ForeignKeyBuilder } from '~/pg-core/foreign-keys';
import type { AnyPgTable, PgTable } from '~/pg-core/table';
import { uniqueKeyName } from '../unique-constraint';
import { PgArrayBuilder } from './array';

export interface ReferenceConfig {
	ref: () => AnyPgColumn;
	actions: {
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
	TTypeConfig extends object = object,
	TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig & { dialect: 'pg' }, TExtraConfig> {
	private foreignKeyConfigs: ReferenceConfig[] = [];

	static readonly [entityKind]: string = 'PgColumnBuilder';

	array(size?: number): PgArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'PgArray';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			enumValues: T['enumValues'];
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return new PgArrayBuilder(this.config.name, this as PgColumnBuilder<any, any>, size);
	}

	references(
		ref: ReferenceConfig['ref'],
		actions: ReferenceConfig['actions'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, actions });
		return this;
	}

	unique(
		name?: string,
		config?: { nulls: 'distinct' | 'not distinct' },
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		this.config.uniqueType = config?.nulls;
		return this;
	}

	/** @internal */
	buildForeignKeys(column: PgColumn, table: PgTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return iife(
				(ref, actions) => {
					const builder = new ForeignKeyBuilder(() => {
						const foreignColumn = ref();
						return { columns: [column], foreignColumns: [foreignColumn] };
					});
					if (actions.onUpdate) {
						builder.onUpdate(actions.onUpdate);
					}
					if (actions.onDelete) {
						builder.onDelete(actions.onDelete);
					}
					return builder.build(table);
				},
				ref,
				actions,
			);
		});
	}

	/** @internal */
	abstract build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgColumn<MakeColumnConfig<T, TTableName>>;
}

export type AnyPgColumnBuilder = PgColumnBuilder<ColumnBuilderBaseConfig<ColumnDataType, string>>;

// To understand how to use `PgColumn` and `AnyPgColumn`, see `Column` and `AnyColumn` documentation.
export abstract class PgColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends Column<T, TRuntimeConfig, TTypeConfig & { dialect: 'pg' }> {
	static readonly [entityKind]: string = 'PgColumn';

	constructor(
		override readonly table: PgTable,
		config: ColumnBuilderRuntimeConfig<T['data'], TRuntimeConfig>,
	) {
		if (!config.uniqueName) {
			config.uniqueName = uniqueKeyName(table, [config.name]);
		}
		super(table, config);
	}
}

export type AnyPgColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = PgColumn<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;
