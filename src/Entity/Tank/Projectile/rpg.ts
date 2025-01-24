/*
    DiepCustom - custom tank game server that shares diep.io's WebSocket protocol
    Copyright (C) 2022 ABCxFF (github.com/ABCxFF)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>
*/

import Bullet from "./Bullet";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { PhysicsFlags, Stat } from "../../../Const/Enums";
import { Entity } from "../../../Native/Entity";
import Trap from "./Trap";
/**
 * 分裂子弹类，继承自普通子弹
 */
export default class Split extends Bullet {
    /** 分裂次数计数 */
    protected splitCount: number = 0;
    /** 最大分裂次数 */
    protected maxSplitCount: number;
    /** 每次分裂的子弹数量 */
    protected splitBulletCount: number;
    /** 分裂角度 */
    protected splitAngle: number;
    protected sizeRatio: number;

    public constructor(
        barrel: Barrel,
        tank: BarrelBase,
        tankDefinition: TankDefinition | null,
        shootAngle: number,
        splitParams: {
            maxSplitCount?: number;
            splitBulletCount?: number;
            splitAngle?: number;
            sizeRatio?: number;
            isChild?: boolean;
        } = {}
    ) {
        super(barrel, tank, tankDefinition, shootAngle);
        this.sizeRatio = splitParams.sizeRatio ?? 0.3;

        // 获取状态等级

        const statLevels = tank.cameraEntity.cameraData.statLevels.values;
        const bulletDamage = statLevels[Stat.BulletDamage];
        const bulletPenetration = statLevels[Stat.BulletPenetration];
        
        // 使用与 Bullet 类相同的属性计算方式
        const bulletDefinition = barrel.definition.bullet;
        
        // 设置伤害和生命值
        this.healthData.values.health = this.healthData.values.maxHealth = (1.5 * bulletPenetration + 2) * bulletDefinition.health;
        this.damagePerTick = (7 + bulletDamage * 3) * bulletDefinition.damage;
        this.damageReduction = 0.25;
        
        // 设置速度和加速度
        this.baseAccel = barrel.bulletAccel;
        this.baseSpeed = barrel.bulletAccel + 30 - Math.random() * bulletDefinition.scatterRate;
        
        // 设置物理属性
        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;
        this.physicsData.values.pushFactor = ((7 / 3) + bulletDamage) * bulletDefinition.damage * bulletDefinition.absorbtionFactor;
        
        // 从参数或默认值获取分裂参数
        this.maxSplitCount = splitParams.maxSplitCount ?? 2;
        this.splitBulletCount = splitParams.splitBulletCount ?? 2;
        this.splitAngle = splitParams.splitAngle ?? (Math.PI / 6);

        // 设置物理属性
        this.physicsData.values.sides = 1;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;

        // 设置生命周期
        this.lifeLength = bulletDefinition.lifeLength !== -1 
            ? 88 * bulletDefinition.lifeLength 
            : Infinity;
    }

    /** 销毁时减少 droneCount */
    public destroy(animate = true) {
        if (animate && this.splitCount < this.maxSplitCount) {
            this.createSplitBullets();
            super.destroy(false);
        } else {
            super.destroy(animate);
        }
    }

    protected createSplitBullets(): void {
        if (!this.barrelEntity || !this.tank) return;
        
        const currentAngle = this.positionData.values.angle;
        const sizeRatio = this.sizeRatio;
        const currentX = this.positionData.values.x;
        const currentY = this.positionData.values.y;
        const currentSplitCount = this.splitCount + 1;  // 增加分裂计数
        
        // 临时修改 barrel 的 definition
        const originalDefinition = { ...this.barrelEntity.definition };
        this.barrelEntity.definition = {
            ...originalDefinition,
            bullet: {
                ...originalDefinition.bullet,
                damage: originalDefinition.bullet.damage * (sizeRatio ** currentSplitCount),
                health: originalDefinition.bullet.health * (sizeRatio ** currentSplitCount),
                lifeLength: (originalDefinition.bullet.lifeLength ?? 1) * 0.5
            }
        };
        
        for (let i = 0; i < this.splitBulletCount; i++) {
            const angleOffset = (i - Math.floor(this.splitBulletCount / 2)) * this.splitAngle;
            const newAngle = currentAngle + angleOffset;

            const splitTrap = new Trap(
                this.barrelEntity,
                this.tank,
                this.tankDefinition,
                newAngle
            );

            splitTrap.positionData.values.x = currentX;
            splitTrap.positionData.values.y = currentY;
            splitTrap.physicsData.size *= 0.2;
            splitTrap.addAcceleration(splitTrap.positionData.values.angle, 100);
        }
        
        // 恢复原始 definition
        this.barrelEntity.definition = originalDefinition;
    }

    /** This allows for factory to hook in before the entity moves. */
    protected tickMixin(tick: number) {
        super.tick(tick);
    }

    public tick(tick: number) {
        super.tick(tick);
        
        if (!Entity.exists(this.barrelEntity)) this.destroy();
    }
}
